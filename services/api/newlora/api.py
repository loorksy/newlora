import asyncio
import hashlib
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal

import httpx
import structlog
from fastapi import (
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import Field, SecretStr
from redis.asyncio import Redis
from sqlalchemy import delete, select, text

from .catalog import catalog, validate_selection
from .config import settings
from .contracts import Contract, Preferences
from .db import (
    Credential,
    DeviceSession,
    Message,
    Record,
    Run,
    Task,
    Usage,
    engine,
    now,
    record_json,
    sessions,
    uid,
)
from .events import replay
from .market import MarketRequest, Oanda, forex_sessions
from .runtime import preferences
from .security import (
    PublicError,
    authenticate,
    credential,
    encrypt,
    issue_tokens,
    password_ok,
    token_pair,
)
from .voice import create_voice

app = FastAPI(title="Newlora", version="0.1.0")
log = structlog.get_logger()


async def owner(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "authentication_required")
    return await authenticate(authorization[7:])


@app.middleware("http")
async def guards(request: Request, call_next):
    request_id = uid()
    if int(request.headers.get("content-length", "0")) > 2_000_000:
        return JSONResponse({"code": "request_too_large"}, 413)
    if request.url.path != "/health/live":
        try:
            redis = Redis.from_url(settings().redis_url)
            key = (
                "rate:"
                + hashlib.sha256(
                    (request.client.host if request.client else "unknown").encode()
                ).hexdigest()
                + ":"
                + str(int(now().timestamp()) // 60)
            )
            count = await redis.incr(key)
            if count == 1:
                await redis.expire(key, 65)
            await redis.aclose()
            limit = 20 if request.url.path.startswith("/auth") else 240
            if count > limit:
                return JSONResponse({"code": "rate_limited"}, 429)
        except Exception:
            return JSONResponse({"code": "service_temporarily_unavailable"}, 503)
    try:
        response = await call_next(request)
    except Exception:
        log.warning("request_failed", request_id=request_id, path=request.url.path)
        response = JSONResponse(
            {"code": "service_temporarily_unavailable", "requestId": request_id}, 503
        )
    response.headers["X-Request-ID"] = request_id
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(PublicError)
async def public_error(request, exc):
    return JSONResponse({"code": exc.code}, exc.status)


@app.exception_handler(RequestValidationError)
async def invalid_request(request, exc):
    # FastAPI default includes original inputs, potentially a submitted secret.
    return JSONResponse({"code": "invalid_request"}, 422)


class Login(Contract):
    password: SecretStr = Field(max_length=256)


class Refresh(Contract):
    refreshToken: SecretStr


@app.post("/auth/login")
async def login(data: Login):
    if not await asyncio.to_thread(password_ok, data.password.get_secret_value()):
        raise HTTPException(401, "invalid_login")
    return await issue_tokens()


@app.post("/auth/refresh")
async def refresh(data: Refresh):
    digest = hashlib.sha256(data.refreshToken.get_secret_value().encode()).hexdigest()
    async with sessions() as db:
        row = await db.scalar(
            select(DeviceSession).where(DeviceSession.refresh_hash == digest).with_for_update()
        )
        if not row or row.revoked or row.expires_at.timestamp() <= now().timestamp():
            raise HTTPException(401, "invalid_refresh")
        new_token = secrets.token_urlsafe(48)
        row.refresh_hash = hashlib.sha256(new_token.encode()).hexdigest()
        await db.commit()
        return token_pair(row, new_token)


@app.post("/auth/logout")
async def logout(data: Refresh, user=Depends(owner)):
    async with sessions() as db:
        row = await db.scalar(
            select(DeviceSession).where(
                DeviceSession.owner == user,
                DeviceSession.refresh_hash
                == hashlib.sha256(data.refreshToken.get_secret_value().encode()).hexdigest(),
            )
        )
        if row:
            row.revoked = True
        await db.commit()
    return {"ok": True}


@app.get("/health/live")
async def live():
    return {"ok": True}


@app.get("/health/ready")
async def ready():
    async with engine().connect() as connection:
        await connection.execute(text("SELECT 1"))
    redis = Redis.from_url(settings().redis_url)
    result = {
        "database": True,
        "redis": await redis.ping(),
        "worker": bool(await redis.get("health:worker")),
        "scheduler": bool(await redis.get("health:scheduler")),
        "voice": bool(await redis.get("health:voice")),
        "notifier": bool(await redis.get("health:notifier")),
    }
    await redis.aclose()
    async with httpx.AsyncClient(timeout=3) as client:
        try:
            result["browser"] = (await client.get(settings().browser_url + "/health")).json()["ok"]
        except Exception:
            result["browser"] = False
    return JSONResponse(result, 200 if all(result.values()) else 503)


@app.get("/settings")
async def get_settings(user=Depends(owner)):
    async with sessions() as db:
        rows = (await db.scalars(select(Credential).where(Credential.owner == user))).all()
    return {
        "preferences": (await preferences(user)).model_dump(),
        "credentials": {
            r.provider: {"configured": True, "lastFour": r.last_four, "connectionStatus": r.status}
            for r in rows
        },
    }


@app.put("/settings/preferences")
async def save_preferences(data: Preferences, user=Depends(owner)):
    for selection in (data.main, data.subagent):
        if selection:
            await validate_selection(user, selection)
    if data.voice:
        await validate_selection(user, data.voice, voice=True)
    async with sessions() as db:
        row = await db.scalar(
            select(Record).where(Record.owner == user, Record.kind == "preferences")
        )
        if row:
            row.data = data.model_dump()
        else:
            db.add(Record(owner=user, kind="preferences", data=data.model_dump()))
        await db.commit()
    return data


class SaveCredential(Contract):
    key: SecretStr = Field(min_length=8, max_length=512)
    account: str | None = Field(default=None, pattern=r"^[0-9-]{3,40}$")
    environment: Literal["practice", "live"] = "practice"


CredentialName = Literal["openai", "anthropic", "zai", "oanda"]


@app.put("/settings/credentials/{name}")
async def save_credential(name: CredentialName, data: SaveCredential, user=Depends(owner)):
    if name == "oanda" and not data.account:
        raise PublicError("oanda_account_required")
    value = {**data.model_dump(exclude={"key"}), "key": data.key.get_secret_value()}
    async with sessions() as db:
        row = await db.scalar(
            select(Credential).where(Credential.owner == user, Credential.provider == name)
        )
        if not row:
            row = Credential(owner=user, provider=name)
            db.add(row)
        row.ciphertext, row.last_four, row.status = encrypt(value), value["key"][-4:], "untested"
        await db.execute(
            delete(Record).where(
                Record.owner == user, Record.kind == "catalog", Record.session_id == name
            )
        )
        await db.commit()
    return {"configured": True, "lastFour": value["key"][-4:], "connectionStatus": "untested"}


@app.delete("/settings/credentials/{name}")
async def remove_credential(name: CredentialName, user=Depends(owner)):
    async with sessions() as db:
        await db.execute(
            delete(Credential).where(Credential.owner == user, Credential.provider == name)
        )
        await db.execute(
            delete(Record).where(
                Record.owner == user, Record.kind == "catalog", Record.session_id == name
            )
        )
        await db.commit()
    return {"configured": False}


@app.post("/settings/credentials/{name}/test")
async def test_credential(name: CredentialName, user=Depends(owner)):
    try:
        if name == "oanda":
            market = await Oanda.for_owner(user)
            try:
                await market.instruments()
            finally:
                await market.close()
        elif name == "zai":
            from .providers import provider

            c = await credential(user, name)
            adapter = provider(name, c["key"])
            try:
                # Official SDK has no key introspection API; one small metered call is needed.
                reply = await adapter.complete(
                    "glm-5.3-flash",
                    [{"role": "user", "content": "Reply OK."}],
                    [],
                    native={"max_tokens": 32},
                )
                async with sessions() as db:
                    db.add(
                        Usage(
                            owner=user,
                            provider=name,
                            model="glm-5.3-flash",
                            agent_type="connection_test",
                            input_tokens=reply.input_tokens,
                            output_tokens=reply.output_tokens,
                            total_tokens=reply.total_tokens,
                            latency_ms=0,
                            success=True,
                        )
                    )
                    await db.commit()
            finally:
                await adapter.close()
        else:
            await catalog(user, name, refresh=True)
        status = "connected"
    except Exception:
        status = "failed"
    async with sessions() as db:
        row = await db.scalar(
            select(Credential).where(Credential.owner == user, Credential.provider == name)
        )
        if row:
            row.status = status
            await db.commit()
    return {"connectionStatus": status}


@app.get("/models/{name}")
async def models(
    name: Literal["openai", "anthropic", "zai"], refresh: bool = False, user=Depends(owner)
):
    return await catalog(user, name, refresh)


class ConversationInput(Contract):
    title: str = Field(default="", max_length=200)


@app.post("/conversations")
async def create_conversation(data: ConversationInput, user=Depends(owner)):
    async with sessions() as db:
        row = Record(owner=user, kind="conversation", data={"title": data.title})
        db.add(row)
        await db.commit()
        return record_json(row)


async def owned_record(db, record_id, user, kind=None):
    row = await db.get(Record, record_id)
    if not row or row.owner != user or (kind and row.kind != kind):
        raise HTTPException(404, "not_found")
    return row


@app.get("/conversations")
async def conversations(q: str = Query(default="", max_length=200), user=Depends(owner)):
    async with sessions() as db:
        query = select(Record).where(Record.owner == user, Record.kind == "conversation")
        if q:
            matching = select(Message.session_id).where(
                Message.content.icontains(q, autoescape=True)
            )
            query = query.where(
                Record.data["title"].as_string().icontains(q, autoescape=True)
                | Record.id.in_(matching)
            )
        return [
            record_json(r)
            for r in (await db.scalars(query.order_by(Record.updated_at.desc()).limit(100))).all()
        ]


@app.patch("/conversations/{session_id}")
async def rename(session_id: str, data: ConversationInput, user=Depends(owner)):
    async with sessions() as db:
        row = await owned_record(db, session_id, user, "conversation")
        row.data = {**row.data, "title": data.title}
        await db.commit()
        return record_json(row)


@app.delete("/conversations/{session_id}")
async def remove_conversation(session_id: str, user=Depends(owner)):
    from .db import Effect, Event

    async with sessions() as db:
        row = await owned_record(db, session_id, user, "conversation")
        active = await db.scalar(
            select(Run.id).where(
                Run.session_id == session_id, Run.status.in_(["queued", "running"])
            )
        )
        if active:
            raise PublicError("stop_active_run_before_delete", 409)
        charts = (
            await db.scalars(
                select(Record).where(
                    Record.owner == user, Record.session_id == session_id, Record.kind == "artifact"
                )
            )
        ).all()
        for artifact in charts:
            image_id = artifact.data.get("data", {}).get("imageId")
            if image_id:
                from .agent_tools import artifact_path

                artifact_path(image_id).unlink(missing_ok=True)
        await db.execute(delete(Event).where(Event.owner == user, Event.session_id == session_id))
        await db.execute(delete(Message).where(Message.session_id == session_id))
        await db.execute(delete(Task).where(Task.session_id == session_id))
        run_ids = (await db.scalars(select(Run.id).where(Run.session_id == session_id))).all()
        for rid in run_ids:
            await db.execute(delete(Effect).where(Effect.key.startswith(rid + ":")))
        await db.execute(delete(Run).where(Run.session_id == session_id))
        await db.execute(
            delete(Record).where(Record.owner == user, Record.session_id == session_id)
        )
        await db.delete(row)
        await db.commit()
    return {"ok": True}


@app.get("/conversations/{session_id}")
async def history(session_id: str, before: int | None = None, user=Depends(owner)):
    async with sessions() as db:
        row = await owned_record(db, session_id, user, "conversation")
        query = select(Message).where(Message.session_id == session_id)
        if before:
            query = query.where(Message.id < before)
        messages = (await db.scalars(query.order_by(Message.id.desc()).limit(100))).all()
        resources = (
            await db.scalars(
                select(Record).where(
                    Record.owner == user,
                    Record.session_id == session_id,
                    Record.kind.in_(["artifact", "recommendation"]),
                )
            )
        ).all()
        active_run = await db.scalar(
            select(Run)
            .where(Run.session_id == session_id, Run.status.in_(["queued", "running"]))
            .order_by(Run.created_at)
            .limit(1)
        )
        return {
            "activeRunId": active_run.id if active_run else None,
            "conversation": record_json(row),
            "messages": [
                {
                    "id": m.id,
                    "clientId": m.client_id,
                    "role": m.role,
                    "text": m.content,
                    "timestamp": m.created_at.isoformat(),
                }
                for m in reversed(messages)
            ],
            "resources": [record_json(r) for r in resources],
        }


class ChatInput(Contract):
    clientId: str = Field(min_length=8, max_length=100)
    text: str = Field(min_length=1, max_length=16000)


@app.post("/conversations/{session_id}/messages")
async def chat(session_id: str, data: ChatInput, user=Depends(owner)):
    async with sessions() as db:
        row = await owned_record(db, session_id, user, "conversation")
        await db.refresh(row, with_for_update=True)
        existing = await db.scalar(
            select(Run).where(Run.owner == user, Run.request_key == data.clientId)
        )
        if existing:
            return {"runId": existing.id}
        run = Run(owner=user, session_id=session_id, request_key=data.clientId, objective=data.text)
        db.add(run)
        db.add(
            Message(session_id=session_id, client_id=data.clientId, role="user", content=data.text)
        )
        if not row.data.get("title"):
            row.data = {**row.data, "title": data.text[:80]}
        row.updated_at = now()
        await db.commit()
        return {"runId": run.id}


@app.post("/runs/{run_id}/stop")
async def stop(run_id: str, user=Depends(owner)):
    async with sessions() as db:
        run = await db.get(Run, run_id)
        if not run or run.owner != user:
            raise HTTPException(404, "not_found")
        run.cancel_requested = True
        await db.commit()
    return {"ok": True}


@app.get("/events")
async def events(after: int = 0, sessionId: str | None = None, user=Depends(owner)):
    return await replay(user, after, sessionId)


@app.websocket("/events/ws")
async def websocket(ws: WebSocket):
    # Authenticate in a bounded first frame; no token in query strings/access logs.
    await ws.accept()
    try:
        message = await asyncio.wait_for(ws.receive_json(), timeout=10)
        user = await authenticate(str(message.get("token", "")))
        cursor = max(0, int(message.get("after", 0)))
        session_id = message.get("sessionId")
        expires = now() + timedelta(minutes=14)
        while now() < expires:
            batch = await replay(user, cursor, session_id)
            for event in batch:
                await ws.send_json(event)
                cursor = event["id"]
            await asyncio.sleep(0.3 if batch else 1)
        await ws.close(code=4001)
    except (WebSocketDisconnect, TimeoutError):
        return
    except Exception:
        await ws.close(code=4401)


@app.get("/resources/{kind}")
async def list_resources(
    kind: Literal["recommendation", "artifact", "memory", "memory_revision", "subagent"],
    user=Depends(owner),
):
    async with sessions() as db:
        rows = (
            await db.scalars(
                select(Record)
                .where(Record.owner == user, Record.kind == kind)
                .order_by(Record.updated_at.desc())
                .limit(200)
            )
        ).all()
        return [record_json(r) for r in rows]


@app.get("/resource/{record_id}")
async def resource(record_id: str, user=Depends(owner)):
    async with sessions() as db:
        row = await owned_record(db, record_id, user)
        revisions = (
            await db.scalars(
                select(Record)
                .where(
                    Record.owner == user,
                    Record.kind == "recommendation_revision",
                    Record.data["recommendationId"].as_string() == record_id,
                )
                .order_by(Record.created_at)
            )
        ).all()
        return {**record_json(row), "timeline": [record_json(r) for r in revisions]}


class Interaction(Contract):
    itemId: str = Field(max_length=200)
    clientId: str = Field(min_length=8, max_length=100)


@app.post("/artifacts/{artifact_id}/select")
async def select_item(artifact_id: str, data: Interaction, user=Depends(owner)):
    async with sessions() as db:
        row = await owned_record(db, artifact_id, user, "artifact")
        options = row.data.get("data", {}).get("options", [])
        option = next((v for v in options if v["id"] == data.itemId), None)
        if row.data["type"] != "select_item" or not option:
            raise PublicError("invalid_selection")
    import json

    return await chat(
        row.session_id,
        ChatInput(
            clientId=data.clientId,
            text=json.dumps(
                {
                    "interaction": "select_item",
                    "artifactId": artifact_id,
                    "itemId": data.itemId,
                    "label": option["label"],
                },
                ensure_ascii=False,
            ),
        ),
        user,
    )


@app.get("/artifacts/{artifact_id}/image")
async def image_file(artifact_id: str, user=Depends(owner)):
    from .agent_tools import artifact_path

    async with sessions() as db:
        row = await owned_record(db, artifact_id, user, "artifact")
    image_id = row.data.get("data", {}).get("imageId")
    if not image_id or not artifact_path(image_id).is_file():
        raise HTTPException(404, "image_not_found")
    return FileResponse(
        artifact_path(image_id), media_type="image/png", filename="newlora-chart.png"
    )


def task_json(t):
    return {
        "id": t.id,
        "sessionId": t.session_id,
        "status": t.status,
        "config": t.config,
        "latestCheck": t.latest_check,
        "nextCheck": t.next_check,
        "latestResult": t.latest_result,
    }


@app.get("/tasks")
async def tasks(user=Depends(owner)):
    async with sessions() as db:
        return [
            task_json(t)
            for t in (
                await db.scalars(
                    select(Task)
                    .where(Task.owner == user)
                    .order_by(Task.created_at.desc())
                    .limit(200)
                )
            ).all()
        ]


@app.post("/tasks/{task_id}/{action}")
async def task_action(
    task_id: str, action: Literal["pause", "resume", "cancel"], user=Depends(owner)
):
    async with sessions() as db:
        row = await db.get(Task, task_id)
        if not row or row.owner != user:
            raise HTTPException(404, "not_found")
        row.status = {"pause": "paused", "resume": "active", "cancel": "cancelled"}[action]
        if action == "resume":
            row.next_check = now()
        else:
            pending = (
                await db.scalars(
                    select(Run).where(Run.task_id == row.id, Run.status.in_(["queued", "running"]))
                )
            ).all()
            for run in pending:
                run.cancel_requested = True
        await db.commit()
        return task_json(row)


@app.get("/usage")
async def usage(start: datetime | None = None, end: datetime | None = None, user=Depends(owner)):
    start, end = start or now() - timedelta(days=30), end or now()
    async with sessions() as db:
        rows = (
            await db.scalars(
                select(Usage).where(
                    Usage.owner == user, Usage.created_at >= start, Usage.created_at <= end
                )
            )
        ).all()
    groups: dict[str, dict[str, int]] = {
        key: {} for key in ["provider", "model", "agent_type", "task_id", "session_id", "day"]
    }
    for row in rows:
        for key in groups:
            value = (
                row.created_at.date().isoformat()
                if key == "day"
                else getattr(row, key) or "unassigned"
            )
            groups[key][value] = groups[key].get(value, 0) + (row.total_tokens or 0)
    return {
        "tokens": sum(r.total_tokens or 0 for r in rows),
        "cost": sum(r.cost for r in rows)
        if rows and all(r.cost is not None for r in rows)
        else None,
        "calls": len(rows),
        "failedCalls": sum(not r.success for r in rows),
        "breakdowns": groups,
        "start": start,
        "end": end,
    }


@app.get("/market/instruments")
async def instruments(user=Depends(owner)):
    market = await Oanda.for_owner(user)
    try:
        return await market.instruments()
    finally:
        await market.close()


@app.get("/market/{instrument}/candles")
async def candles(instrument: str, timeframe: str = "H1", user=Depends(owner)):
    market = await Oanda.for_owner(user)
    try:
        return await market.candles(MarketRequest(instrument=instrument, timeframe=timeframe))
    finally:
        await market.close()


@app.get("/market/{instrument}/price")
async def price(instrument: str, user=Depends(owner)):
    market = await Oanda.for_owner(user)
    try:
        return await market.pricing(instrument)
    finally:
        await market.close()


@app.get("/market/sessions/current")
async def session_status(user=Depends(owner)):
    return forex_sessions()


class PushDevice(Contract):
    token: str = Field(min_length=16, max_length=4096)


@app.put("/devices/push")
async def push_device(data: PushDevice, user=Depends(owner)):
    key = hashlib.sha256(data.token.encode()).hexdigest()
    async with sessions() as db:
        row = await db.scalar(
            select(Record).where(
                Record.owner == user, Record.kind == "push_device", Record.session_id == key
            )
        )
        if not row:
            db.add(Record(owner=user, kind="push_device", session_id=key, data=data.model_dump()))
            await db.commit()
    return {"ok": True}


class VoiceOffer(Contract):
    sessionId: str | None = None
    sdp: str | None = Field(default=None, max_length=65536)


@app.post("/voice/session")
async def voice(data: VoiceOffer, user=Depends(owner)):
    return await create_voice(user, data.sdp, data.sessionId)


chart_dist = Path("packages/chart/dist")
if chart_dist.is_dir():
    app.mount("/chart", StaticFiles(directory=chart_dist, html=True), name="chart")


class VoiceResearch(Contract):
    callId: str = Field(min_length=1, max_length=100)
    objective: str = Field(min_length=1, max_length=12000)


@app.post("/voice/{voice_id}/research")
async def voice_research(voice_id: str, data: VoiceResearch, user=Depends(owner)):
    from .voice import queue_research

    async with sessions() as db:
        row = await owned_record(db, voice_id, user, "voice")
    run_id = await queue_research(user, row.session_id, "voice:" + data.callId, data.objective)
    return {"runId": run_id}


@app.get("/runs/{run_id}")
async def run_status(run_id: str, user=Depends(owner)):
    async with sessions() as db:
        run = await db.get(Run, run_id)
        if not run or run.owner != user:
            raise HTTPException(404, "not_found")
        answer = await db.scalar(select(Message).where(Message.client_id == run_id + ":answer"))
        return {"status": run.status, "text": answer.content if answer else None}
