from datetime import timedelta
from unittest.mock import AsyncMock

import pytest
from newlora.db import Outbox, Task, now, sessions
from newlora.jobs import deliver_outbox
from test_api import client


@pytest.mark.parametrize("status", ["cancelled", "paused", "failed"])
async def test_cancelled_or_paused_task_suppresses_pending_push(run_record, monkeypatch, status):
    async with sessions() as db:
        task = Task(
            owner="owner",
            session_id=run_record.session_id,
            config={"objective": "watch"},
            status=status,
        )
        db.add(task)
        await db.flush()
        row = Outbox(
            owner="owner",
            dedupe="notification",
            payload={"mode": "call", "taskId": task.id, "sessionId": run_record.session_id},
        )
        db.add(row)
        await db.commit()
    send = AsyncMock()
    monkeypatch.setattr("newlora.notifications.send_push", send)
    await deliver_outbox()
    send.assert_not_called()
    async with sessions() as db:
        assert (await db.get(Outbox, row.id)).status == "cancelled"


async def test_outbox_retry_reuses_notification_identity(run_record, monkeypatch):
    async with sessions() as db:
        row = Outbox(
            owner="owner",
            dedupe="retry",
            payload={"mode": "urgent", "sessionId": run_record.session_id},
        )
        db.add(row)
        await db.commit()
    send = AsyncMock(side_effect=[RuntimeError("transport"), None])
    monkeypatch.setattr("newlora.notifications.send_push", send)
    await deliver_outbox()
    async with sessions() as db:
        stored = await db.get(Outbox, row.id)
        stored.lease_until = now() - timedelta(seconds=1)
        await db.commit()
    await deliver_outbox()
    await deliver_outbox()
    assert send.await_count == 2
    assert {c.args[1]["notificationId"] for c in send.call_args_list} == {row.id}


async def test_expired_call_and_notification_ownership(monkeypatch, run_record):
    async with sessions() as db:
        row = Outbox(
            owner="owner",
            dedupe="expired",
            payload={"mode": "call", "sessionId": run_record.session_id},
            created_at=now() - timedelta(minutes=3),
        )
        other = Outbox(owner="other", dedupe="other", payload={"mode": "normal"})
        db.add_all([row, other])
        await db.commit()
    async with await client(monkeypatch) as c:
        assert not (await c.get("/notifications/" + row.id)).json()["available"]
        assert (await c.get("/notifications/" + other.id)).status_code == 404
