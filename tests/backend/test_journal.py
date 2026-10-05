import asyncio
from datetime import timedelta
from unittest.mock import AsyncMock

import pytest
from newlora.contracts import Preferences
from newlora.db import Event, Operation, Outbox, Record, Run, Task, now, sessions
from newlora.jobs import claim
from newlora.journal import plan
from newlora.providers.base import Reply, ToolCall
from newlora.runtime import Runtime
from newlora.security import PublicError
from sqlalchemy import func, select


async def replace(run):
    async with sessions() as db:
        row = await db.get(Run, run.id)
        row.lease_until = now() - timedelta(seconds=1)
        await db.commit()
    return await claim()


async def test_planned_operation_survives_crash_and_replan_wording(run_record):
    rt = Runtime(run_record, Preferences())
    original = {"instrument": "XAU_USD", "summary": "Original user-authorized thesis"}
    key = await plan(rt, "create_recommendation", original)
    replacement = Runtime(await replace(run_record), Preferences())
    result = await replacement.tools.execute(
        "create_recommendation", {**original, "summary": "Different wording after replacement"}
    )
    assert result["data"]["summary"] == original["summary"]
    async with sessions() as db:
        operation = await db.get(Operation, key)
        assert operation.state == "committed" and original["summary"] not in operation.arguments
    with pytest.raises(PublicError, match="run_interrupted"):
        await rt.tools.execute("create_recommendation", original)


async def test_commit_before_tool_result_checkpoint_resumes_without_duplicate(run_record):
    class Crash(BaseException):
        pass

    rt = Runtime(run_record, Preferences())
    rt.call = AsyncMock(
        return_value=Reply(
            calls=[
                ToolCall(
                    "first",
                    "create_recommendation",
                    {"instrument": "XAU_USD", "summary": "gold thesis"},
                )
            ]
        )
    )
    execute = rt.tools.execute

    async def crash(name, args):
        await execute(name, args)
        raise Crash()

    rt.tools.execute = crash
    with pytest.raises(Crash):
        await rt.loop([{"role": "user", "content": "recommend gold"}])
    replacement = Runtime(await replace(run_record), Preferences())
    replacement.call = AsyncMock(return_value=Reply(text="Recovered answer"))
    assert await replacement.loop([]) == "Recovered answer"
    assert replacement.call.await_count == 1
    assert any(m["role"] == "tool" for m in replacement.call.call_args.args[0])
    async with sessions() as db:
        assert (
            await db.scalar(
                select(func.count()).select_from(Record).where(Record.kind == "recommendation")
            )
            == 1
        )
        assert await db.scalar(select(func.count()).select_from(Operation)) == 1
    again = Runtime(await replace(run_record), Preferences())
    again.call = AsyncMock(side_effect=AssertionError("must use saved answer"))
    assert await again.loop([]) == "Recovered answer"


async def test_duplicate_task_after_replan_and_notification(run_record):
    rt = Runtime(run_record, Preferences())
    args = {
        "objective": "Watch gold",
        "instrument": "XAU_USD",
        "schedule": "interval",
        "interval_seconds": 1800,
        "notification": "normal",
    }
    one = await rt.tools.execute("create_task", args)
    two = await rt.tools.execute("create_task", {**args, "objective": "Watch the gold thesis"})
    assert one["id"] == two["id"]
    async with sessions() as db:
        run = await db.get(Run, run_record.id)
        run.task_id = one["id"]
        await db.commit()
    rt.task_id = one["id"]
    await rt.tools.execute("task_outcome", {"summary": "condition changed", "condition_met": True})
    await rt.tools.execute("task_outcome", {"summary": "wording changed", "condition_met": True})
    async with sessions() as db:
        assert await db.scalar(select(func.count()).select_from(Task)) == 1
        assert await db.scalar(select(func.count()).select_from(Outbox)) == 1


async def test_concurrent_mutation_retries_at_most_one_commit(run_record):
    first = Runtime(run_record, Preferences())
    second = Runtime(run_record, Preferences())
    args = {"instrument": "EUR_USD", "summary": "thesis"}
    results = await asyncio.gather(
        first.tools.execute("create_recommendation", args),
        second.tools.execute("create_recommendation", args),
        return_exceptions=True,
    )
    # SQLite lacks row locks; conflicts may require a retry. PostgreSQL serializes both.
    assert any(isinstance(r, dict) for r in results)
    replay = await first.tools.execute("create_recommendation", args)
    async with sessions() as db:
        assert (
            await db.scalar(
                select(func.count()).select_from(Record).where(Record.kind == "recommendation")
            )
            == 1
        )
    assert replay["id"] == next(r["id"] for r in results if isinstance(r, dict))


async def test_tool_error_emits_failure_without_exception_content(run_record):
    rt = Runtime(run_record, Preferences())
    rt.call = AsyncMock(
        side_effect=[
            Reply(calls=[ToolCall("bad", "market_price", {"instrument": "XAU_USD"})]),
            Reply(text="Unavailable"),
        ]
    )
    rt.tools.execute = AsyncMock(side_effect=RuntimeError("secret-exception"))
    await rt.loop([{"role": "user", "content": "gold"}])
    async with sessions() as db:
        events = (await db.scalars(select(Event))).all()
        payloads = [r.payload for r in events]
        assert any(
            p.get("type") == "tool_failed" and p["code"] == "tool_temporarily_unavailable"
            for p in payloads
        )
        assert not any(p.get("type") == "tool_completed" for p in payloads)
        assert "secret-exception" not in str(payloads)


async def test_legacy_creation_event_is_adopted_after_upgrade(run_record):
    from newlora.db import record_json

    async with sessions() as db:
        recommendation = Record(
            owner="owner",
            kind="recommendation",
            session_id=run_record.session_id,
            data={"instrument": "XAU_USD", "summary": "old version created this"},
        )
        db.add(recommendation)
        await db.flush()
        db.add(
            Event(
                owner="owner",
                session_id=run_record.session_id,
                run_id=run_record.id,
                event="agent.activity",
                payload={"type": "recommendation_created", "entity_id": recommendation.id},
            )
        )
        await db.commit()
        original = record_json(recommendation)
    runtime = Runtime(run_record, Preferences())
    result = await runtime.tools.execute(
        "create_recommendation", {"instrument": "XAU_USD", "summary": "replanned"}
    )
    assert result["id"] == original["id"]
    async with sessions() as db:
        assert (
            await db.scalar(
                select(func.count()).select_from(Record).where(Record.kind == "recommendation")
            )
            == 1
        )
