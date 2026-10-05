"""Bounded restart-safe catch-up indexing and scheduled consolidation, no vector service."""

from sqlalchemy import func, select
from sqlalchemy.orm.attributes import flag_modified

from .db import Message, Record, Run, SearchDocument, now, sessions
from .retrieval import KINDS


async def maintain_memory():
    async with sessions() as db:
        records = (
            await db.scalars(
                select(Record)
                .where(
                    Record.kind.in_(KINDS),
                    ~select(SearchDocument.id)
                    .where(SearchDocument.id == "record:" + Record.id)
                    .exists(),
                )
                .order_by(Record.created_at)
                .with_for_update(skip_locked=True)
                .limit(50)
            )
        ).all()
        for row in records:
            flag_modified(row, "data")
        messages = (
            await db.scalars(
                select(Message)
                .where(
                    Message.role == "assistant",
                    ~select(SearchDocument.id)
                    .where(
                        SearchDocument.id
                        == "message:" + Message.session_id + ":" + Message.client_id
                    )
                    .exists(),
                )
                .order_by(Message.id)
                .with_for_update(skip_locked=True)
                .limit(50)
            )
        ).all()
        for message in messages:
            flag_modified(message, "content")
        await db.commit()
    async with sessions() as db:
        # Lock conversations to serialize this queue operation with workers and other schedulers.
        conversations = (
            await db.scalars(
                select(Record)
                .where(
                    Record.kind == "conversation",
                    Record.id.in_(
                        select(Record.session_id)
                        .where(
                            Record.kind == "checkpoint",
                            Record.data["consolidated"].as_boolean().is_(False),
                        )
                        .group_by(Record.session_id)
                        .having(func.count() >= 3)
                    ),
                )
                .with_for_update(skip_locked=True)
                .limit(100)
            )
        ).all()
        for conversation in conversations:
            checkpoints = (
                await db.scalars(
                    select(Record)
                    .where(Record.kind == "checkpoint", Record.session_id == conversation.id)
                    .order_by(Record.created_at)
                )
            ).all()
            pending = [r for r in checkpoints if not r.data.get("consolidated")]
            if len(pending) < 3:
                continue
            # Daily retry for unavailable providers, unique key across restarts/schedulers.
            key = "memory:" + pending[-1].id + ":" + now().date().isoformat()
            if not await db.scalar(
                select(Run.id).where(Run.owner == conversation.owner, Run.request_key == key)
            ):
                db.add(
                    Run(
                        owner=conversation.owner,
                        session_id=conversation.id,
                        request_key=key,
                        purpose="memory",
                        objective="Consolidate explicit preferences from pending checkpoints.",
                    )
                )
        await db.commit()
