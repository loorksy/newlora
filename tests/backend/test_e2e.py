"""Arabic, mocked provider + market + rendered image, real runtime and SQL persistence."""

import base64
import json
from datetime import timedelta
from unittest.mock import AsyncMock

import httpx
import pytest
from newlora import runtime
from newlora.agent_tools import TradingTools
from newlora.contracts import ModelSelection, Preferences
from newlora.db import (
    Credential,
    Event,
    Message,
    Outbox,
    Record,
    Run,
    Task,
    Usage,
    now,
    sessions,
    uid,
)
from newlora.jobs import deliver_outbox, schedule_due
from newlora.market import Oanda
from newlora.providers.base import Reply, ToolCall
from newlora.security import encrypt
from sqlalchemy import func, select


@pytest.mark.parametrize("restart", [False, True], ids=["arabic", "worker-restart"])
async def test_arabic_analysis_recommendation_task_push(run_record, monkeypatch, restart):
    seen_images = []
    steps = 0

    class Model:
        async def close(self):
            pass

        async def complete(self, model, messages, tools, **kwargs):
            nonlocal steps
            if tools and tools[0]["name"] == "route_intent":
                return Reply(
                    calls=[
                        ToolCall(
                            "intent",
                            "route_intent",
                            {
                                "intent": "recommendation",
                                "instrument": "XAU_USD",
                                "needs_visual_chart": True,
                                "needs_market_data": True,
                                "needs_persistent_task": True,
                            },
                        )
                    ],
                    input_tokens=10,
                    output_tokens=5,
                    total_tokens=15,
                )
            steps += 1
            seen_images.extend(m["images"] for m in messages if m.get("images"))
            if steps == 1:
                calls = [
                    ToolCall(
                        "chart",
                        "chart_render",
                        {
                            "instrument": "XAU_USD",
                            "timeframe": "M15",
                            "count": 10,
                            "drawings": [
                                {"id": "level", "kind": "horizontal", "points": [{"value": 2400}]}
                            ],
                        },
                    )
                ]
            elif steps == 2:
                calls = [
                    ToolCall(
                        "rec",
                        "create_recommendation",
                        {
                            "instrument": "XAU_USD",
                            "summary": "توصية مبنية على الرسم المرفق",
                            "direction": "neutral",
                            "status": "active",
                        },
                    )
                ]
            elif steps == 3:
                rec = json.loads(
                    next(m["content"] for m in reversed(messages) if m.get("call_id") == "rec")
                )
                calls = [
                    ToolCall(
                        "task",
                        "create_task",
                        {
                            "objective": "تابع هذه التوصية وأبلغني إن تغيّر الوضع",
                            "instrument": "XAU_USD",
                            "schedule": "interval",
                            "interval_seconds": 1800,
                            "notification": "call",
                            "recommendation_id": rec["id"],
                        },
                    )
                ]
            else:
                return Reply(
                    text="تم تحليل الرسم وإنشاء التوصية ومهمة المتابعة.",
                    input_tokens=20,
                    output_tokens=10,
                    total_tokens=30,
                )
            return Reply(calls=calls, input_tokens=20, output_tokens=10, total_tokens=30)

    monkeypatch.setattr(runtime, "provider", lambda *a: Model())
    monkeypatch.setattr(runtime, "validate_selection", AsyncMock())
    async with sessions() as db:
        db.add(
            Credential(
                owner="owner",
                provider="openai",
                ciphertext=encrypt({"key": "test-key"}),
                last_four="-key",
            )
        )
        db.add(
            Message(
                session_id=run_record.session_id,
                client_id=uid(),
                role="user",
                content="حلّل الذهب بصرياً وأنشئ توصية وتابعها كل نصف ساعة واتصل بي إذا تغيّر الوضع",
            )
        )
        await db.commit()

    def oanda_response(req):
        if req.url.path.endswith("/instruments"):
            return httpx.Response(
                200,
                json={
                    "instruments": [
                        {
                            "name": "XAU_USD",
                            "type": "METAL",
                            "displayPrecision": 3,
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
                        "volume": 10,
                        "complete": True,
                        "mid": {"o": "2395", "h": "2405", "l": "2390", "c": "2400"},
                    }
                ]
            },
        )

    async def market(owner):
        return Oanda(
            "test",
            "account",
            client=httpx.AsyncClient(
                base_url="https://api-fxpractice.oanda.com/v3",
                transport=httpx.MockTransport(oanda_response),
            ),
        )

    monkeypatch.setattr(Oanda, "for_owner", market)
    render = AsyncMock(return_value={"png": base64.b64encode(b"test-image-pixels").decode()})
    monkeypatch.setattr(TradingTools, "browser", render)
    prefs = Preferences(main=ModelSelection(provider="openai", model="gpt-6.1-sol"))
    rt = runtime.Runtime(run_record, prefs)
    if restart:

        class Crash(BaseException):
            pass

        original_execute = rt.tools.execute

        async def crash_after_recommendation(name, args):
            result = await original_execute(name, args)
            if name == "create_recommendation":
                raise Crash()
            return result

        rt.tools.execute = crash_after_recommendation
        with pytest.raises(Crash):
            await rt.run("حلّل الذهب بصرياً وأنشئ توصية وتابعها كل نصف ساعة واتصل بي إذا تغيّر الوضع")
        async with sessions() as db:
            interrupted = await db.get(Run, run_record.id)
            interrupted.lease_until = now() - timedelta(seconds=1)
            await db.commit()
        from newlora.jobs import claim

        rt = runtime.Runtime(await claim(), prefs)
    answer = await rt.run("حلّل الذهب بصرياً وأنشئ توصية وتابعها كل نصف ساعة واتصل بي إذا تغيّر الوضع")
    assert "المتابعة" in answer and seen_images
    assert render.call_args.args[1]["drawings"][0]["kind"] == "horizontal"
    async with sessions() as db:
        rec = await db.scalar(select(Record).where(Record.kind == "recommendation"))
        assert rec.data["stop"] is None and rec.data["monitoring_task_id"]
        task = await db.get(Task, rec.data["monitoring_task_id"])
        assert task.config["notification"] == "call"
        task.next_check = now() - timedelta(seconds=1)
        parent = await db.get(Run, run_record.id)
        parent.status = "completed"
        await db.commit()
        assert await db.scalar(select(func.count()).select_from(Usage)) == 5
    await schedule_due()
    async with sessions() as db:
        monitoring = await db.scalar(select(Run).where(Run.task_id == task.id))
        monitoring.status = "running"
        monitoring.fence = uid()
        monitoring.lease_until = now() + timedelta(minutes=5)
        await db.commit()
    monitor = runtime.Runtime(monitoring, prefs)
    await monitor.tools.execute(
        "task_outcome", {"summary": "تغيّر الوضع وفق طلبك", "condition_met": True}
    )
    send = AsyncMock()
    monkeypatch.setattr("newlora.notifications.send_push", send)
    await deliver_outbox()
    assert send.call_args.args[1]["mode"] == "call"
    async with sessions() as db:
        assert (await db.scalar(select(Outbox))).status == "sent"
        events = (await db.scalars(select(Event))).all()
        assert any(e.payload.get("type") == "voice_call_requested" for e in events)
        assert "reasoning" not in json.dumps([e.payload for e in events])
