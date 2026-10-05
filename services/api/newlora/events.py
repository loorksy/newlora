from sqlalchemy import select

from .contracts import ActivityEvent, EventEnvelope
from .db import Event, sessions


def envelope(row: Event) -> dict:
    return EventEnvelope(
        id=row.id,
        event=row.event,
        sessionId=row.session_id,
        runId=row.run_id,
        timestamp=row.created_at,
        payload=row.payload,
    ).model_dump(mode="json")


async def emit(owner: str, session_id: str | None, run_id: str | None, event: str, payload: dict):
    if event == "agent.activity":
        payload = ActivityEvent.model_validate(payload).model_dump(exclude_none=True)
    async with sessions() as db:
        row = Event(owner=owner, session_id=session_id, run_id=run_id, event=event, payload=payload)
        db.add(row)
        await db.commit()
        return envelope(row)


async def replay(owner: str, after: int, session_id: str | None = None):
    async with sessions() as db:
        q = select(Event).where(Event.owner == owner, Event.id > after)
        if session_id:
            q = q.where(Event.session_id == session_id)
        rows = (await db.scalars(q.order_by(Event.id).limit(250))).all()
        return [envelope(x) for x in rows]
