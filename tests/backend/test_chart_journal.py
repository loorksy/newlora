import base64
import json
from datetime import timedelta

import httpx
import pytest
from newlora.agent_tools import TradingTools, artifact_path
from newlora.config import settings
from newlora.contracts import ModelSelection, Preferences
from newlora.db import Credential, Event, Operation, Record, Run, now, sessions
from newlora.jobs import claim
from newlora.market import Oanda
from newlora.providers.base import Reply, ToolCall
from newlora.runtime import Runtime
from newlora.security import PublicError, decrypt, encrypt
from sqlalchemy import func, select


class Crash(BaseException):
    pass


CHART = {"instrument": "XAU_USD", "timeframe": "H1", "count": 2}


def prefs():
    return Preferences(main=ModelSelection(provider="openai", model="gpt-6.1-sol"))


async def credential():
    async with sessions() as db:
        db.add(
            Credential(
                owner="owner",
                provider="openai",
                ciphertext=encrypt({"key": "test-key"}),
                last_four="tkey",
            )
        )
        await db.commit()


def install_model(monkeypatch, replies):
    class Model:
        def __init__(self):
            self.seen = []

        async def close(self):
            pass

        async def complete(self, model, messages, tools, **kwargs):
            self.seen.append(messages)
            reply = replies[len(self.seen) - 1]
            if isinstance(reply, BaseException):
                raise reply
            return reply

    model = Model()
    monkeypatch.setattr("newlora.runtime.provider", lambda *_args: model)
    return model


def install_market(monkeypatch):
    calls = {"n": 0}

    def response(request):
        if request.url.path.endswith("/instruments"):
            return httpx.Response(
                200,
                json={
                    "instruments": [
                        {
                            "name": "XAU_USD",
                            "type": "METAL",
                            "displayPrecision": 2,
                            "pipLocation": -2,
                        }
                    ]
                },
            )
        return httpx.Response(
            200,
            json={
                "candles": [
                    {
                        "time": "2026-10-02T12:00:00Z",
                        "volume": 1,
                        "complete": True,
                        "mid": {"o": "1", "h": "2", "l": "1", "c": "2"},
                    }
                ]
            },
        )

    async def market(_owner):
        calls["n"] += 1
        return Oanda(
            "test",
            "account",
            client=httpx.AsyncClient(
                base_url="https://api-fxpractice.oanda.com/v3",
                transport=httpx.MockTransport(response),
            ),
        )

    monkeypatch.setattr(Oanda, "for_owner", market)
    return calls


def png(payload: bytes) -> dict:
    return {"png": base64.b64encode(payload).decode()}


async def counts():
    async with sessions() as db:
        artifacts = await db.scalar(
            select(func.count()).select_from(Record).where(Record.kind == "artifact")
        )
        contexts = await db.scalar(
            select(func.count()).select_from(Event).where(Event.event == "chart.context")
        )
        operations = (
            await db.scalars(select(Operation).where(Operation.tool == "chart_render"))
        ).all()
    files = [
        path
        for path in settings().artifact_dir.glob("*")
        if path.is_file() and path.suffix == ".png"
    ]
    partials = list(settings().artifact_dir.glob("*.partial"))
    return artifacts, contexts, operations, files, partials


async def test_crash_after_chart_persist_replays_one_artifact(run_record, monkeypatch):
    await credential()
    market = install_market(monkeypatch)
    payload = b"chart-pixels-one"
    renders = {"n": 0}

    async def browser(_self, _path, data):
        renders["n"] += 1
        assert data["instrument"] == "XAU_USD"
        assert data["drawings"] == []
        return png(payload)

    monkeypatch.setattr(TradingTools, "browser", browser)
    model = install_model(
        monkeypatch,
        [
            Reply(calls=[ToolCall("chart-1", "chart_render", CHART)]),
            Reply(text="saw the chart"),
        ],
    )
    runtime = Runtime(run_record, prefs())
    original = runtime.tools.execute

    async def crash_after_persist(name, args):
        result = await original(name, args)
        if name == "chart_render":
            raise Crash()
        return result

    runtime.tools.execute = crash_after_persist
    with pytest.raises(Crash):
        await runtime.loop([{"role": "user", "content": "show gold"}])
    artifacts, contexts, operations, files, partials = await counts()
    assert artifacts == 1 and contexts == 1 and len(files) == 1 and partials == []
    assert len(operations) == 1 and operations[0].state == "committed"
    assert "data:image/" not in json.dumps(operations[0].result)
    artifact_id = operations[0].result["artifact"]["id"]
    assert files[0] == artifact_path(artifact_id)
    assert files[0].read_bytes() == payload
    async with sessions() as db:
        row = await db.get(Run, run_record.id)
        row.lease_until = now() - timedelta(seconds=1)
        await db.commit()
    replacement = Runtime(await claim(), prefs())
    assert await replacement.loop([]) == "saw the chart"
    assert renders["n"] == 1 and market["n"] == 1
    image = "data:image/png;base64," + base64.b64encode(payload).decode()
    assert model.seen[-1][-1]["images"] == [image]
    tool = next(item for item in model.seen[-1] if item["role"] == "tool")
    assert json.loads(tool["content"])["artifact"]["id"] == artifact_id
    artifacts, contexts, _operations, files, partials = await counts()
    assert artifacts == 1 and contexts == 1 and len(files) == 1 and partials == []
    async with sessions() as db:
        checkpoint = (await db.get(Run, run_record.id)).checkpoint
    state = decrypt(checkpoint)
    encoded = json.dumps(state)
    assert "data:image/" not in checkpoint and "data:image/" not in encoded
    assert base64.b64encode(payload).decode()[:24] not in encoded
    assert any(
        image.get("artifact_id") == artifact_id
        for message in state["messages"]
        if message.get("images")
        for image in message["images"]
    )


async def test_chart_checkpoint_size_is_independent_of_png_bytes(run_record, monkeypatch):
    await credential()
    install_market(monkeypatch)
    sizes = {}

    async def one(label, payload, slot):
        async def browser(_self, _path, _data):
            return png(payload)

        monkeypatch.setattr(TradingTools, "browser", browser)
        runtime = Runtime(run_record, prefs())
        runtime.operation_slot = slot
        result = await runtime.tools.execute("chart_render", CHART)
        assert result["_images"] == [
            {"type": "artifact_image", "artifact_id": result["artifact"]["id"]}
        ]
        assert "data:image/" not in json.dumps(result)
        await runtime.save_checkpoint(
            [
                {"role": "user", "content": "show gold"},
                {
                    "role": "user",
                    "content": "Actual tool-rendered image.",
                    "images": result["_images"],
                },
            ],
            1,
        )
        async with sessions() as db:
            sizes[label] = len((await db.get(Run, run_record.id)).checkpoint)

    await one("small", b"a" * 100, "small")
    await one("large", b"B" * 1_500_000, "large")
    assert abs(sizes["large"] - sizes["small"]) < 5_000
    assert sizes["large"] < 100_000
    async with sessions() as db:
        state = decrypt((await db.get(Run, run_record.id)).checkpoint)
        ciphertext = (await db.get(Run, run_record.id)).checkpoint
    assert "data:image/" not in ciphertext and "data:image/" not in json.dumps(state)
    assert "B" * 100 not in json.dumps(state)
    artifacts, contexts, _operations, files, partials = await counts()
    assert artifacts == 2 and contexts == 2 and len(files) == 2 and partials == []


async def test_failed_render_is_uncommitted_and_retry_uses_planned_args(run_record, monkeypatch):
    install_market(monkeypatch)
    seen = []

    async def fail(_self, _path, _data):
        raise PublicError("chart_rendering_failed", 502)

    monkeypatch.setattr(TradingTools, "browser", fail)
    runtime = Runtime(run_record, prefs())
    runtime.operation_slot = "retry-slot"
    with pytest.raises(PublicError, match="chart_rendering_failed"):
        await runtime.tools.execute("chart_render", CHART)
    _artifacts, _contexts, operations, files, partials = await counts()
    assert operations[0].state != "committed"
    assert files == [] and partials == []

    async def succeed(_self, _path, data):
        seen.append(data["drawings"])
        return png(b"retried-chart")

    monkeypatch.setattr(TradingTools, "browser", succeed)
    result = await runtime.tools.execute(
        "chart_render",
        {**CHART, "drawings": [{"id": "late", "kind": "horizontal", "points": [{"value": 1}]}]},
    )
    assert seen == [[]]
    assert result["_images"][0]["type"] == "artifact_image"
    artifacts, contexts, operations, files, partials = await counts()
    assert artifacts == 1 and contexts == 1 and len(operations) == 1
    assert operations[0].state == "committed" and len(files) == 1 and partials == []


async def test_missing_file_is_repaired_without_a_second_artifact(run_record, monkeypatch):
    market = install_market(monkeypatch)
    renders = {"n": 0}

    async def browser(_self, _path, data):
        renders["n"] += 1
        return png(b"original" if renders["n"] == 1 else b"repaired")

    monkeypatch.setattr(TradingTools, "browser", browser)
    runtime = Runtime(run_record, prefs())
    runtime.operation_slot = "repair"
    first = await runtime.tools.execute("chart_render", CHART)
    artifact_path(first["artifact"]["id"]).unlink()
    second = await runtime.tools.execute("chart_render", CHART)
    assert second["artifact"]["id"] == first["artifact"]["id"]
    assert artifact_path(first["artifact"]["id"]).read_bytes() == b"repaired"
    assert market["n"] == 1 and renders["n"] == 2
    artifacts, contexts, _operations, files, partials = await counts()
    assert artifacts == 1 and contexts == 1 and len(files) == 1 and partials == []


async def test_stale_worker_cannot_write_another_chart(run_record, monkeypatch):
    install_market(monkeypatch)
    state = {"steal": True, "fence": None}

    async def browser(_self, _path, _data):
        if state["steal"]:
            state["steal"] = False
            async with sessions() as db:
                row = await db.get(Run, run_record.id)
                from newlora.db import uid

                state["fence"] = uid()
                row.fence = state["fence"]
                await db.commit()
        return png(b"fenced-chart")

    monkeypatch.setattr(TradingTools, "browser", browser)
    stale = Runtime(run_record, prefs())
    stale.operation_slot = "same-chart"
    with pytest.raises(PublicError, match="run_interrupted"):
        await stale.tools.execute("chart_render", CHART)
    artifacts, contexts, operations, files, partials = await counts()
    assert artifacts == 0 and contexts == 0 and files == [] and partials == []
    assert operations[0].state != "committed"
    async with sessions() as db:
        fresh = await db.get(Run, run_record.id)
    owner = Runtime(fresh, prefs())
    owner.operation_slot = "same-chart"
    result = await owner.tools.execute("chart_render", CHART)
    stale.operation_slot = "another-chart"
    with pytest.raises(PublicError, match="run_interrupted"):
        await stale.tools.execute("chart_render", {**CHART, "timeframe": "M15"})
    artifacts, contexts, _operations, files, partials = await counts()
    assert artifacts == 1 and contexts == 1 and len(files) == 1 and partials == []
    assert files[0] == artifact_path(result["artifact"]["id"])


async def test_distinct_chart_calls_remain_distinct(run_record, monkeypatch):
    install_market(monkeypatch)

    async def browser(_self, _path, _data):
        return png(b"normal-chart")

    monkeypatch.setattr(TradingTools, "browser", browser)
    runtime = Runtime(run_record, prefs())
    runtime.operation_slot = "first"
    first = await runtime.tools.execute(
        "chart_render",
        {**CHART, "drawings": [{"id": "level", "kind": "horizontal", "points": [{"value": 2}]}]},
    )
    runtime.operation_slot = "second"
    second = await runtime.tools.execute("chart_render", {**CHART, "timeframe": "M15"})
    assert first["artifact"]["id"] != second["artifact"]["id"]
    assert first["_images"][0]["artifact_id"] == first["artifact"]["id"]
    artifacts, contexts, _operations, files, partials = await counts()
    assert artifacts == 2 and contexts == 2 and len(files) == 2 and partials == []
    async with sessions() as db:
        events = (await db.scalars(select(Event).where(Event.event == "agent.activity"))).all()
    assert sum(event.payload.get("type") == "chart_rendered" for event in events) == 2
    assert sum(event.payload.get("type") == "chart_annotation_added" for event in events) == 1
