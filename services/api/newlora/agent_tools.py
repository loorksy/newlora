import base64
from typing import Any, Literal
from uuid import UUID

import httpx
from pydantic import Field
from sqlalchemy import select

from . import journal
from .config import settings
from .contracts import Artifact, Contract, Drawing, Recommendation, TaskConfig, TaskOutcome
from .db import Event, Operation, Outbox, Record, Run, Task, now, record_json, sessions, uid
from .market import MarketRequest, Oanda, forex_sessions
from .retrieval import MemorySearch, search
from .scheduling import next_check
from .security import PublicError, decrypt


class Empty(Contract):
    pass


class Instrument(Contract):
    instrument: str = Field(pattern=r"^[A-Z0-9_]{3,24}$")


class Search(Contract):
    query: str = Field(min_length=1, max_length=500)


class OpenPage(Contract):
    url: str = Field(max_length=2048)
    screenshot: bool = False
    actions: list[dict] = Field(default_factory=list, max_length=12)


class ChartRequest(MarketRequest):
    drawings: list[Drawing] = Field(default_factory=list, max_length=100)


class Delegate(Contract):
    objectives: list[str] = Field(min_length=1, max_length=16)
    context: str = Field(default="", max_length=16000)
    allowed_tools: list[str] = Field(default_factory=list)


class UpdateRecommendation(Contract):
    id: str
    recommendation: Recommendation


class ManageTask(Contract):
    id: str
    action: Literal["pause", "resume", "cancel", "edit"]
    config: TaskConfig | None = None


SPECS: dict[str, tuple[type[Contract], str]] = {
    "memory_search": (
        MemorySearch,
        "Search previous conversations, analyses, recommendations and revisions, chart metadata, monitoring outcomes and explicit preferences. Use for comparisons and continuing previous theses. Narrow instrument/dates/types as relevant; results are historical evidence, not current prices.",
    ),
    "instruments": (Empty, "List only Forex and metals supported by the connected OANDA account."),
    "market_price": (Instrument, "Fetch timestamped OANDA bid/ask and tradeable status."),
    "market_candles": (
        MarketRequest,
        "Fetch OANDA candles for a model-chosen timeframe; timestamps and complete flags are included.",
    ),
    "market_sessions": (
        Empty,
        "Conventional Forex sessions with timezone/DST transitions; not instrument opening guarantees.",
    ),
    "chart_render": (
        ChartRequest,
        "Render KLineChart Pro from real OANDA candles with optional drawings. Returns image pixels for visual inspection and a persistent chart artifact. Choose timeframe as needed.",
    ),
    "web_search": (
        Search,
        "Search current news/web via independent SearXNG. Source URLs/titles and retrieval timestamps included.",
    ),
    "web_open": (
        OpenPage,
        "Open an untrusted public page in isolated Chromium. Can extract text, take screenshot and perform bounded pointer/keyboard actions.",
    ),
    "web_extract": (OpenPage, "Extract readable text from a public page with source metadata."),
    "browser_open": (
        OpenPage,
        "Browse a public page using optional click/type/scroll/key actions. No shell or host access.",
    ),
    "browser_screenshot": (OpenPage, "Capture a public browser page for visual inspection."),
    "create_recommendation": (
        Recommendation,
        "Persist a recommendation only when requested. Optional values must be justified; do not fabricate entries/stops/targets.",
    ),
    "update_recommendation": (
        UpdateRecommendation,
        "Update a recommendation and append its public change history.",
    ),
    "create_task": (
        TaskConfig,
        "Persist explicitly requested monitoring, schedule, objective and notification behavior. The interval is task-specific, not a trading rule.",
    ),
    "manage_task": (ManageTask, "Pause, resume, cancel or edit an existing user task."),
    "create_artifact": (
        Artifact,
        "Persist an interactive sheet/table/chart/report/selection. Data must be grounded in tool results.",
    ),
    "delegate": (
        Delegate,
        "Dynamically delegate zero or several scoped research objectives; results return to the lead agent. No mandatory specialist roles.",
    ),
    "task_outcome": (
        TaskOutcome,
        "For a monitoring run only: record the checked condition and whether its user-defined objective is met. Notifications follow stored task policy.",
    ),
}
READ_TOOLS = {
    "memory_search",
    "instruments",
    "market_price",
    "market_candles",
    "market_sessions",
    "chart_render",
    "web_search",
    "web_open",
    "web_extract",
    "browser_open",
    "browser_screenshot",
}


def schemas(names=None):
    return [
        {"name": name, "description": desc, "parameters": model.model_json_schema()}
        for name, (model, desc) in SPECS.items()
        if names is None or name in names
    ]


class TradingTools:
    def __init__(self, runtime):
        self.runtime = runtime

    async def browser(self, path: str, data: dict):
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                settings().browser_url + path,
                json=data,
                headers={"Authorization": "Bearer " + settings().browser_token.get_secret_value()},
            )
            if response.status_code != 200:
                raise PublicError(
                    "chart_rendering_failed" if path == "/render" else "browser_unavailable", 502
                )
            return response.json()

    async def execute(self, name: str, raw: dict) -> dict:
        if name not in SPECS:
            raise PublicError("tool_unavailable")
        args: Any = SPECS[name][0].model_validate(raw)
        rt = self.runtime
        await rt.check_fence()
        if name == "memory_search":
            return await search(rt.owner, args)
        if name == "delegate":
            return await rt.delegate(args)
        if name == "market_sessions":
            return forex_sessions()
        if name in {"instruments", "market_price", "market_candles", "chart_render"}:
            market = await Oanda.for_owner(rt.owner)
            try:
                if name == "instruments":
                    return {
                        "instruments": await market.instruments(),
                        "retrievedAt": now().isoformat(),
                    }
                if name == "market_price":
                    return await market.pricing(args.instrument)
                candles = await market.candles(
                    MarketRequest.model_validate(args.model_dump(exclude={"drawings"}))
                )
            finally:
                await market.close()
            await rt.activity(
                "market_data_loaded", instrument=args.instrument, timeframe=args.timeframe
            )
            if name == "market_candles":
                return candles
            from .catalog import capability

            if not capability(rt.selection.provider, rt.selection.model)["vision"]:
                raise PublicError("selected_model_has_no_vision")
            state = {
                "instrument": args.instrument,
                "timeframe": args.timeframe,
                "candles": candles["candles"],
                "metadata": candles.get("metadata"),
                "drawings": [d.model_dump(exclude_none=True) for d in args.drawings],
                "locale": rt.preferences.language,
            }
            rendered = await self.browser("/render", state)
            artifact_id = uid()
            root = settings().artifact_dir
            root.mkdir(parents=True, exist_ok=True)
            path = root / (artifact_id + ".png")
            image_bytes = base64.b64decode(rendered["png"], validate=True)
            if len(image_bytes) > 15_000_000:
                raise PublicError("chart_too_large")
            path.write_bytes(image_bytes)
            path.chmod(0o600)
            artifact = Artifact(
                type="chart",
                title=f"{args.instrument} · {args.timeframe}",
                data={**state, "imageId": artifact_id, "retrievedAt": candles["retrievedAt"]},
            )
            record = await self.persist("artifact", artifact.model_dump(), artifact_id)
            await rt.activity(
                "chart_rendered",
                instrument=args.instrument,
                timeframe=args.timeframe,
                entity_id=record["id"],
            )
            if args.drawings:
                await rt.activity("chart_annotation_added", entity_id=record["id"])
            await rt.publish(
                "chart.context",
                {
                    "instrument": args.instrument,
                    "timeframe": args.timeframe,
                    "artifactId": record["id"],
                },
            )
            # Pixels stay in transient model context, not in event or usage records.
            return {"artifact": record, "_images": ["data:image/png;base64," + rendered["png"]]}
        if name == "web_search":
            async with httpx.AsyncClient(timeout=25) as client:
                response = await client.get(
                    settings().search_url + "/search", params={"q": args.query, "format": "json"}
                )
                if response.status_code != 200:
                    raise PublicError("search_unavailable", 502)
                results = response.json().get("results", [])[:8]
            return {
                "results": [
                    {
                        "url": r["url"],
                        "title": r.get("title", ""),
                        "text": r.get("content", ""),
                        "publishedAt": r.get("publishedDate"),
                        "retrievedAt": now().isoformat(),
                    }
                    for r in results
                ],
                "untrusted": True,
            }
        if name in {"web_open", "web_extract", "browser_open", "browser_screenshot"}:
            result = await self.browser(
                "/browse",
                {
                    **args.model_dump(),
                    "screenshot": args.screenshot or name == "browser_screenshot",
                },
            )
            png = result.pop("png", None)
            result.update({"retrievedAt": now().isoformat(), "untrusted": True})
            if png:
                result["_images"] = ["data:image/png;base64," + png]
            return result
        effect_key = await journal.plan(rt, name, raw)
        async with sessions() as db:
            await rt.fence_transaction(db)
            operation = await db.get(Operation, effect_key)
            if operation.state == "committed":
                return operation.result
            # The originally planned arguments are authoritative after a crash/replan.
            args = SPECS[name][0].model_validate(decrypt(operation.arguments))
            operation.state = "executing"
            event_type = None
            row: Any
            if name == "create_recommendation":
                row = Record(
                    owner=rt.owner,
                    session_id=rt.session_id,
                    kind="recommendation",
                    data=args.model_dump(mode="json"),
                )
                db.add(row)
                await db.flush()
                result = record_json(row)
                event_type = "recommendation_created"
            elif name == "update_recommendation":
                row = await db.get(Record, args.id)
                if not row or row.owner != rt.owner or row.kind != "recommendation":
                    raise PublicError("recommendation_not_found", 404)
                db.add(
                    Record(
                        owner=rt.owner,
                        session_id=rt.session_id,
                        kind="recommendation_revision",
                        data={
                            "recommendationId": row.id,
                            "before": row.data,
                            "after": args.recommendation.model_dump(mode="json"),
                        },
                    )
                )
                row.data, row.updated_at, row.version = (
                    args.recommendation.model_dump(mode="json"),
                    now(),
                    row.version + 1,
                )
                result = record_json(row)
                event_type = "recommendation_updated"
            elif name == "create_task":
                if rt.task_id:
                    raise PublicError("automation_cannot_create_tasks")
                occurrence = next_check(args.model_dump(mode="json"), now(), initial=True)
                if occurrence is None:
                    raise PublicError("schedule_has_no_future_occurrence")
                row = Task(
                    owner=rt.owner,
                    session_id=rt.session_id,
                    config=args.model_dump(mode="json"),
                    next_check=occurrence,
                )
                db.add(row)
                await db.flush()
                if args.recommendation_id:
                    rec = await db.get(Record, args.recommendation_id)
                    if not rec or rec.owner != rt.owner or rec.kind != "recommendation":
                        raise PublicError("recommendation_not_found", 404)
                    rec.data = {**rec.data, "monitoring_task_id": row.id}
                result = {"id": row.id, "status": row.status, "config": row.config}
                event_type = "task_created"
            elif name == "manage_task":
                row = await db.get(Task, args.id)
                if not row or row.owner != rt.owner:
                    raise PublicError("task_not_found", 404)
                if args.action == "edit":
                    if not args.config:
                        raise PublicError("task_config_required")
                    row.config = args.config.model_dump(mode="json")
                    row.next_check = next_check(row.config, now(), initial=True)
                else:
                    row.status = {"pause": "paused", "resume": "active", "cancel": "cancelled"}[
                        args.action
                    ]
                    if args.action == "resume":
                        row.next_check = next_check(row.config, now(), initial=True)
                    else:
                        pending = await db.scalars(
                            select(Run).where(
                                Run.task_id == row.id, Run.status.in_(["queued", "running"])
                            )
                        )
                        for pending_run in pending:
                            pending_run.cancel_requested = True
                result = {"id": row.id, "status": row.status}
            elif name == "create_artifact":
                row = Record(
                    owner=rt.owner,
                    session_id=rt.session_id,
                    kind="artifact",
                    data=args.model_dump(mode="json"),
                )
                db.add(row)
                await db.flush()
                result = record_json(row)
                event_type = "artifact_created"
            elif name == "task_outcome":
                row = await db.get(Task, rt.task_id) if rt.task_id else None
                if not row or row.owner != rt.owner or row.status != "active":
                    raise PublicError("not_a_monitoring_run")
                row.latest_check, row.latest_result = now(), args.summary
                if (
                    args.completed
                    or row.config["schedule"] == "once"
                    or row.config["schedule"] == "recurrence"
                    and row.next_check is None
                ):
                    row.status = "completed"
                if args.condition_met and row.config["notification"] != "silent":
                    db.add(
                        Outbox(
                            owner=rt.owner,
                            dedupe=rt.run_id + ":notification",
                            payload={
                                "mode": row.config["notification"],
                                "sessionId": rt.session_id,
                                "taskId": row.id,
                                "recommendationId": row.config.get("recommendation_id"),
                                "summary": args.summary,
                            },
                        )
                    )
                result = {"id": row.id, **args.model_dump()}
                event_type = "task_checked"
            else:
                raise PublicError("tool_unavailable")
            operation.state, operation.result, operation.committed_at = "committed", result, now()
            if event_type:
                db.add(
                    Event(
                        owner=rt.owner,
                        session_id=rt.session_id,
                        run_id=rt.run_id,
                        event="agent.activity",
                        payload={"type": event_type, "entity_id": result["id"]},
                    )
                )
                db.add(
                    Event(
                        owner=rt.owner,
                        session_id=rt.session_id,
                        run_id=rt.run_id,
                        event="resource.updated",
                        payload={"id": result["id"]},
                    )
                )
            await db.commit()
            return result

    async def persist(self, kind: str, data: dict, record_id: str | None = None):
        async with sessions() as db:
            await self.runtime.fence_transaction(db)
            row = Record(
                id=record_id or uid(),
                owner=self.runtime.owner,
                session_id=self.runtime.session_id,
                kind=kind,
                data=data,
            )
            db.add(row)
            await db.commit()
            return record_json(row)


def artifact_path(image_id: str):
    return settings().artifact_dir / (str(UUID(image_id)) + ".png")
