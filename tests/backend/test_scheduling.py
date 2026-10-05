from datetime import UTC, datetime, timedelta

import pytest
from newlora.contracts import Preferences, TaskConfig
from newlora.db import Run, Task, now, sessions
from newlora.jobs import schedule_due
from newlora.runtime import Runtime
from newlora.scheduling import next_check
from sqlalchemy import func, select


def config(rule="FREQ=DAILY", zone="Europe/London", start="2026-01-01T08:00:00+00:00", **kw):
    return TaskConfig(
        objective="Research as requested",
        schedule="recurrence",
        recurrence=rule,
        timezone=zone,
        start=start,
        **kw,
    ).model_dump(mode="json")


@pytest.mark.parametrize(
    "rule,after,expected",
    [
        ("FREQ=WEEKLY;BYDAY=MO", "2026-01-06T08:00:00+00:00", "2026-01-12T08:00:00+00:00"),
        (
            "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
            "2026-01-09T08:00:00+00:00",
            "2026-01-12T08:00:00+00:00",
        ),
        ("FREQ=DAILY", "2026-07-01T07:00:00+00:00", "2026-07-02T07:00:00+00:00"),
        (
            "FREQ=HOURLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=8,9,10,11,12,13,14,15,16;BYMINUTE=0,30",
            "2026-01-09T16:30:00+00:00",
            "2026-01-12T08:00:00+00:00",
        ),
    ],
)
def test_calendar_occurrences(rule, after, expected):
    assert next_check(config(rule), datetime.fromisoformat(after)).isoformat() == expected


def test_local_evening_timezone():
    c = config(zone="Asia/Riyadh", start="2026-01-01T19:00:00+03:00")
    assert next_check(c, datetime(2026, 1, 2, 12, tzinfo=UTC)) == datetime(
        2026, 1, 2, 16, tzinfo=UTC
    )


def test_dst_spring_skips_nonexistent_wall_time():
    c = config(zone="America/New_York", start="2026-03-01T02:30:00-05:00")
    assert next_check(c, datetime(2026, 3, 7, 7, 30, tzinfo=UTC)) == datetime(
        2026, 3, 9, 6, 30, tzinfo=UTC
    )


def test_dst_fall_runs_first_fold_only():
    c = config(zone="America/New_York", start="2026-10-25T01:30:00-04:00")
    first = next_check(c, datetime(2026, 10, 31, 5, 30, tzinfo=UTC))
    assert first == datetime(2026, 11, 1, 5, 30, tzinfo=UTC)
    assert next_check(c, first) == datetime(2026, 11, 2, 6, 30, tzinfo=UTC)


def test_until_inclusive_and_count_end():
    c = config(until="2026-01-02T08:00:00+00:00")
    last = next_check(c, datetime(2026, 1, 1, 8, tzinfo=UTC))
    assert last == datetime(2026, 1, 2, 8, tzinfo=UTC)
    assert next_check(c, last) is None
    assert next_check(config("FREQ=DAILY;COUNT=1"), datetime(2026, 1, 1, 8, tzinfo=UTC)) is None


@pytest.mark.parametrize(
    "rule,zone",
    [("FREQ=SECONDLY", "UTC"), ("FREQ=DAILY\nRDATE:20270101", "UTC"), ("FREQ=DAILY", "bad/zone")],
)
def test_reject_invalid_recurrence(rule, zone):
    with pytest.raises(ValueError):
        config(rule, zone)


async def test_recurring_scheduler_restart_pause_resume(run_record):
    c = config(start=(now() - timedelta(days=2)).isoformat())
    async with sessions() as db:
        task = Task(
            owner="owner",
            session_id=run_record.session_id,
            config=c,
            next_check=now() - timedelta(days=1),
        )
        db.add(task)
        await db.commit()
    await schedule_due()
    await schedule_due()
    async with sessions() as db:
        assert (
            await db.scalar(select(func.count()).select_from(Run).where(Run.task_id == task.id))
            == 1
        )
        current = await db.get(Task, task.id)
        assert current.next_check.timestamp() > now().timestamp()
        current.next_check = now() - timedelta(seconds=1)
        await db.commit()
    rt = Runtime(run_record, Preferences())
    await rt.tools.execute("manage_task", {"id": task.id, "action": "pause"})
    async with sessions() as db:
        pending = await db.scalar(select(Run).where(Run.task_id == task.id))
        assert pending.cancel_requested
    await schedule_due()
    async with sessions() as db:
        assert (
            await db.scalar(select(func.count()).select_from(Run).where(Run.task_id == task.id))
            == 1
        )
    await rt.tools.execute("manage_task", {"id": task.id, "action": "resume"})
    async with sessions() as db:
        current = await db.get(Task, task.id)
        assert current.status == "active"
        assert current.next_check.timestamp() > now().timestamp()
    await schedule_due()
    async with sessions() as db:
        assert (
            await db.scalar(select(func.count()).select_from(Run).where(Run.task_id == task.id))
            == 1
        )
