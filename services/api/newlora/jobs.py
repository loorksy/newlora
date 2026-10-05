import asyncio
from contextlib import suppress
from datetime import datetime, timedelta

import structlog
from redis.asyncio import Redis
from sqlalchemy import and_, exists, or_, select, update

from . import memory
from .config import settings
from .db import Event, Outbox, Record, Run, Task, now, sessions, uid
from .runtime import Runtime, preferences
from .scheduling import next_check
from .security import PublicError

log = structlog.get_logger()


async def schedule_due():
    async with sessions() as db:
        tasks = (
            await db.scalars(
                select(Task)
                .where(Task.status == "active", Task.next_check <= now())
                .with_for_update(skip_locked=True)
                .limit(100)
            )
        ).all()
        for task in tasks:
            config = task.config
            until = datetime.fromisoformat(config["until"]) if config.get("until") else None
            if until and until.timestamp() < now().timestamp():
                task.status, task.next_check = "completed", None
                continue
            running = await db.scalar(
                select(Run.id)
                .where(Run.task_id == task.id, Run.status.in_(["queued", "running"]))
                .limit(1)
            )
            if running:
                continue
            key = f"task:{task.id}:{task.next_check.isoformat()}"
            existing = await db.scalar(
                select(Run.id).where(Run.owner == task.owner, Run.request_key == key)
            )
            if not existing:
                db.add(
                    Run(
                        owner=task.owner,
                        session_id=task.session_id,
                        task_id=task.id,
                        request_key=key,
                        objective="Monitoring task configuration (user authorized): "
                        + __import__("json").dumps(config, ensure_ascii=False),
                    )
                )
            task.next_check = next_check(config, task.next_check)
            # Coalesce missed occurrences after downtime; keep the calendar anchor.
            if task.next_check and task.next_check.timestamp() <= now().timestamp():
                task.next_check = next_check(config, now())
        await db.commit()


async def claim() -> Run | None:
    async with sessions() as db:
        # Lock conversation first: serializes queued runs for a session across workers.
        candidate_sessions = (
            await db.scalars(
                select(Record)
                .where(
                    Record.kind == "conversation",
                    exists(
                        select(Run.id).where(
                            Run.session_id == Record.id,
                            or_(
                                Run.status == "queued",
                                and_(Run.status == "running", Run.lease_until < now()),
                            ),
                        )
                    ),
                )
                .order_by(Record.updated_at)
                .with_for_update(skip_locked=True)
                .limit(10)
            )
        ).all()
        for conversation in candidate_sessions:
            live = await db.scalar(
                select(Run.id)
                .where(
                    Run.session_id == conversation.id,
                    Run.status == "running",
                    Run.lease_until >= now(),
                )
                .limit(1)
            )
            if live:
                continue
            run = await db.scalar(
                select(Run)
                .where(
                    Run.session_id == conversation.id,
                    or_(
                        Run.status == "queued",
                        and_(Run.status == "running", Run.lease_until < now()),
                    ),
                )
                .order_by(Run.created_at)
                .with_for_update(skip_locked=True)
                .limit(1)
            )
            if not run:
                continue
            if run.cancel_requested:
                run.status = "cancelled"
                continue
            if run.task_id:
                task = await db.get(Task, run.task_id)
                if not task or task.status != "active":
                    run.status = "cancelled"
                    continue
            if run.attempts >= 5:
                run.status = "failed"
                db.add(
                    Event(
                        owner=run.owner,
                        session_id=run.session_id,
                        run_id=run.id,
                        event="run.failed",
                        payload={"code": "restart_retry_limit"},
                    )
                )
                continue
            run.status, run.fence = "running", uid()
            run.lease_until = now() + timedelta(seconds=settings().lease_seconds)
            run.attempts += 1
            await db.commit()
            return run
        await db.commit()
        return None


async def renew(run: Run):
    while True:
        await asyncio.sleep(settings().lease_seconds / 3)
        async with sessions() as db:
            result = await db.execute(
                update(Run)
                .where(
                    Run.id == run.id,
                    Run.fence == run.fence,
                    Run.status == "running",
                    Run.cancel_requested.is_(False),
                )
                .values(lease_until=now() + timedelta(seconds=settings().lease_seconds))
            )
            await db.commit()
            if not result.rowcount:
                return


async def execute(run: Run):
    heartbeat = asyncio.create_task(renew(run))
    status, code = "completed", None
    try:
        async with asyncio.timeout(900):
            runtime = Runtime(run, await preferences(run.owner))
            if run.purpose == "memory":
                await memory.consolidate(
                    run.owner, run.session_id, runtime.call, runtime.fence_transaction
                )
            else:
                await runtime.run(run.objective)
    except PublicError as exc:
        status, code = ("cancelled" if exc.code == "run_interrupted" else "failed"), exc.code
    except Exception:
        status, code = "failed", "agent_temporarily_unavailable"
        log.warning("run_failed", run_id=run.id, session_id=run.session_id, task_id=run.task_id)
    finally:
        heartbeat.cancel()
        with suppress(asyncio.CancelledError):
            await heartbeat
    async with sessions() as db:
        current = await db.get(Run, run.id)
        if current and current.fence == run.fence:
            current.status, current.lease_until = status, None
            db.add(
                Event(
                    owner=run.owner,
                    session_id=run.session_id,
                    run_id=run.id,
                    event="run." + status,
                    payload={"code": code} if code else {},
                )
            )
            if status == "completed" and run.purpose == "chat" and not run.task_id:
                prior = await db.scalar(
                    select(Outbox.id).where(Outbox.dedupe == run.id + ":completion")
                )
                if not prior:
                    db.add(
                        Outbox(
                            owner=run.owner,
                            dedupe=run.id + ":completion",
                            payload={"mode": "normal", "sessionId": run.session_id},
                        )
                    )
            if status == "failed" and run.task_id:
                task = await db.get(Task, run.task_id)
                if task:
                    task.latest_result = code
                    if task.config["schedule"] == "once":
                        task.status = "failed"
            await db.commit()


async def deliver_outbox():
    from .notifications import send_push

    async with sessions() as db:
        await db.execute(
            update(Outbox)
            .where(Outbox.attempts >= 10, Outbox.status == "sending", Outbox.lease_until < now())
            .values(status="failed")
        )
        await db.commit()
        row = await db.scalar(
            select(Outbox)
            .where(
                or_(
                    Outbox.status == "pending",
                    and_(Outbox.status == "sending", Outbox.lease_until < now()),
                ),
                Outbox.attempts < 10,
            )
            .order_by(Outbox.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if not row:
            return
        if row.payload.get("taskId"):
            task = await db.get(Task, row.payload["taskId"])
            if not task or task.status in {"cancelled", "paused", "failed"}:
                row.status = "cancelled"
                await db.commit()
                return
        row.status, row.fence = "sending", uid()
        row.lease_until = now() + timedelta(seconds=90)
        row.attempts += 1
        await db.commit()
    try:
        await send_push(row.owner, {**row.payload, "notificationId": row.id})
    except Exception:
        # Retry on the next lease expiry; payload never enters logs.
        return
    async with sessions() as db:
        current = await db.get(Outbox, row.id)
        if current and current.fence == row.fence:
            current.status = "sent"
            db.add(
                Event(
                    owner=row.owner,
                    session_id=row.payload.get("sessionId"),
                    run_id=None,
                    event="agent.activity",
                    payload={
                        "type": "voice_call_requested"
                        if row.payload["mode"] == "call"
                        else "notification_sent",
                        "entity_id": row.id,
                    },
                )
            )
            await db.commit()


async def serve(role: str):
    redis = Redis.from_url(settings().redis_url)
    while True:
        await redis.set(f"health:{role}", now().isoformat(), ex=120)
        try:
            if role == "scheduler":
                await schedule_due()
                from .maintenance import maintain_memory

                await maintain_memory()
            elif role == "notifier":
                await deliver_outbox()
            else:
                run = await claim()
                if run:
                    # Heartbeat separate from the provider call.
                    async def health_loop():
                        while True:
                            await redis.set("health:worker", now().isoformat(), ex=120)
                            await asyncio.sleep(30)

                    beat = asyncio.create_task(health_loop())
                    try:
                        await execute(run)
                    finally:
                        beat.cancel()
                        with suppress(asyncio.CancelledError):
                            await beat
        except Exception:
            log.warning("service_iteration_failed", role=role)
        await asyncio.sleep(2 if role == "worker" else 5)


if __name__ == "__main__":
    import sys

    asyncio.run(serve(sys.argv[1] if len(sys.argv) > 1 else "worker"))
