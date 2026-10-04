from datetime import timedelta

import pytest
from newlora.contracts import Preferences
from newlora.db import Message, Record, Run, Task, now, sessions, uid
from newlora.jobs import claim, schedule_due
from newlora.memory import compact, context, revise_fact
from newlora.providers.base import Reply
from newlora.runtime import Runtime
from newlora.security import PublicError
from sqlalchemy import func, select


async def test_effect_idempotency_and_fencing(run_record):
    rt = Runtime(run_record, Preferences())
    args = {"instrument": "XAU_USD", "summary": "Observed structure only", "status": "active"}
    one = await rt.tools.execute("create_recommendation", args)
    two = await rt.tools.execute("create_recommendation", args)
    assert one["id"] == two["id"] and one["data"]["stop"] is None
    async with sessions() as db:
        run = await db.get(Run, run_record.id)
        run.fence = uid()
        await db.commit()
    with pytest.raises(PublicError):
        await rt.tools.execute("create_recommendation", {**args, "summary": "stale worker"})


async def test_restart_reclaims_expired_run_and_serializes_session(run_record):
    async with sessions() as db:
        run = await db.get(Run, run_record.id)
        run.lease_until = now() - timedelta(seconds=1)
        db.add(
            Run(
                owner="owner",
                session_id=run_record.session_id,
                request_key=uid(),
                objective="second",
            )
        )
        await db.commit()
    recovered = await claim()
    assert recovered.id == run_record.id and recovered.fence != run_record.fence
    assert await claim() is None


async def test_scheduler_occurrence_survives_repeated_ticks(run_record):
    async with sessions() as db:
        task = Task(
            owner="owner",
            session_id=run_record.session_id,
            config={
                "objective": "watch",
                "schedule": "interval",
                "interval_seconds": 1800,
                "notification": "normal",
            },
            next_check=now() - timedelta(seconds=1),
        )
        db.add(task)
        await db.commit()
        task_id = task.id
    await schedule_due()
    await schedule_due()
    async with sessions() as db:
        assert (
            await db.scalar(select(func.count()).select_from(Run).where(Run.task_id == task_id))
            == 1
        )
        task = await db.get(Task, task_id)
        assert task.next_check.timestamp() > now().timestamp()


async def test_compaction_preserves_originals_and_revision_history(run_record):
    async with sessions() as db:
        db.add_all(
            [
                Message(
                    session_id=run_record.session_id,
                    client_id=str(i),
                    role="user",
                    content=f"message {i}",
                )
                for i in range(45)
            ]
        )
        await db.commit()

    async def summarize(*args, **kwargs):
        return Reply(text="Durable public summary")

    await compact("owner", run_record.session_id, summarize)
    async with sessions() as db:
        assert await db.scalar(select(func.count()).select_from(Message)) == 45
    c = await context("owner", run_record.session_id)
    assert "Durable public summary" in c[0]["content"] and len(c) == 13
    await revise_fact("owner", "USER.language", "Arabic", "explicit")
    await revise_fact("owner", "USER.language", "English", "correction", expected_version=1)
    async with sessions() as db:
        assert (
            await db.scalar(
                select(func.count()).select_from(Record).where(Record.kind == "memory_revision")
            )
            == 2
        )


async def test_expired_worker_cannot_commit_memory_after_summarization(run_record):
    import pytest
    from newlora.contracts import Preferences
    from newlora.runtime import Runtime
    from newlora.security import PublicError

    async with sessions() as db:
        db.add_all(
            [
                Message(
                    session_id=run_record.session_id,
                    client_id=str(i),
                    role="user",
                    content="original",
                )
                for i in range(45)
            ]
        )
        await db.commit()
    runtime = Runtime(run_record, Preferences())

    async def interrupted_summary(*args, **kwargs):
        async with sessions() as db:
            run = await db.get(Run, run_record.id)
            run.fence = "replacement-worker"
            await db.commit()
        return Reply(text="Summary from stale worker")

    with pytest.raises(PublicError, match="run_interrupted"):
        await compact(
            "owner", run_record.session_id, interrupted_summary, runtime.fence_transaction
        )
    async with sessions() as db:
        assert (
            await db.scalar(
                select(func.count()).select_from(Record).where(Record.kind == "checkpoint")
            )
            == 0
        )
        assert await db.scalar(select(func.count()).select_from(Message)) == 45


async def test_memory_insert_version_conflict_preserves_existing_fact(run_record):
    import pytest

    await revise_fact("owner", "USER.language", "Arabic", "user")
    with pytest.raises(ValueError, match="memory_revision_conflict"):
        await revise_fact(
            "owner", "USER.language", "English", "stale_consolidation", expected_version=0
        )
    async with sessions() as db:
        fact = await db.scalar(select(Record).where(Record.kind == "memory"))
        assert fact.data["value"] == "Arabic"


async def test_concurrent_new_memory_key_has_one_canonical_record(run_record):
    import asyncio

    results = await asyncio.gather(
        revise_fact("owner", "USER.language", "Arabic", "first", expected_version=0),
        revise_fact("owner", "USER.language", "English", "second", expected_version=0),
        return_exceptions=True,
    )
    assert sum(isinstance(result, Exception) for result in results) == 1
    async with sessions() as db:
        assert (
            await db.scalar(select(func.count()).select_from(Record).where(Record.kind == "memory"))
            == 1
        )
