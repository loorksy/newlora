import json
from datetime import timedelta
from unittest.mock import AsyncMock

import pytest
from newlora.db import Message, Record, Run, SearchDocument, now, sessions
from newlora.maintenance import maintain_memory
from newlora.memory import consolidate, revise_fact
from newlora.providers.base import Reply
from newlora.retrieval import MemorySearch, search
from sqlalchemy import delete, func, select


async def test_cross_chat_date_instrument_and_history_retrieval(run_record):
    old = now() - timedelta(days=14)
    async with sessions() as db:
        other = Record(owner="owner", kind="conversation", data={"title": "old gold"})
        db.add(other)
        await db.flush()
        db.add_all(
            [
                Record(
                    owner="owner",
                    session_id=other.id,
                    kind="recommendation",
                    created_at=old,
                    data={"instrument": "XAU_USD", "summary": "gold previous thesis"},
                ),
                Record(
                    owner="owner",
                    session_id=other.id,
                    kind="recommendation_revision",
                    created_at=old,
                    data={
                        "before": {"instrument": "XAU_USD", "summary": "gold prior structure"},
                        "after": {"instrument": "XAU_USD", "summary": "gold corrected thesis"},
                    },
                ),
                Record(
                    owner="owner",
                    session_id=run_record.session_id,
                    kind="recommendation",
                    data={"instrument": "EUR_USD", "summary": "euro current thesis"},
                ),
                Record(
                    owner="other",
                    kind="recommendation",
                    data={"instrument": "XAU_USD", "summary": "gold private thesis"},
                ),
                Message(
                    session_id=other.id,
                    role="assistant",
                    content="XAU_USD gold analysis from two weeks ago",
                    created_at=old,
                ),
            ]
        )
        await db.commit()
    result = await search(
        "owner",
        MemorySearch(
            query="compare gold thesis",
            instrument="XAU_USD",
            since=old - timedelta(seconds=1),
            until=old + timedelta(seconds=1),
        ),
    )
    assert len(result["results"]) == 3
    assert {r["resourceType"] for r in result["results"]} == {
        "analysis",
        "recommendation",
        "recommendation_revision",
    }
    assert all(
        r["sessionId"] == other.id and r["reference"]["resourceId"] for r in result["results"]
    )
    assert "private" not in json.dumps(result)
    only_history = await search(
        "owner", MemorySearch(query="gold", resource_types=["recommendation_revision"])
    )
    assert (
        len(only_history["results"]) == 1 and "corrected" in only_history["results"][0]["summary"]
    )


async def test_index_secret_redaction_and_fact_rejection(run_record):
    secret = "sk-do-not-store-this-secret"
    async with sessions() as db:
        db.add(
            Record(
                owner="owner",
                kind="checkpoint",
                session_id=run_record.session_id,
                data={"summary": f"gold API key={secret}"},
            )
        )
        await db.commit()
    result = await search("owner", MemorySearch(query="gold"))
    assert secret not in json.dumps(result) and "[redacted]" in str(result)
    with pytest.raises(ValueError, match="memory_contains_secret"):
        await revise_fact("owner", "USER.report_format", f"api_key={secret}", "explicit")


async def test_consolidation_requires_explicit_evidence_and_versions_corrections(run_record):
    async with sessions() as db:
        db.add(
            Message(
                session_id=run_record.session_id,
                role="user",
                content="Please use Arabic reports. Correction: use English reports.",
            )
        )
        db.add_all(
            [
                Record(
                    owner="owner",
                    kind="checkpoint",
                    session_id=run_record.session_id,
                    data={
                        "cursor": i,
                        "summary": "User prefers English reports",
                        "consolidated": False,
                    },
                )
                for i in range(3)
            ]
        )
        await db.commit()
    await revise_fact("owner", "USER.language", "Arabic", "explicit")
    call = AsyncMock(
        return_value=Reply(
            text=json.dumps(
                {
                    "facts": [
                        {
                            "key": "USER.language",
                            "value": "English",
                            "evidence": "Correction: use English reports.",
                        },
                        {"key": "USER.identity", "value": "verified trader", "evidence": "made up"},
                    ]
                }
            )
        )
    )
    await consolidate("owner", run_record.session_id, call)
    await consolidate("owner", run_record.session_id, call)
    assert call.await_count == 1
    async with sessions() as db:
        fact = await db.scalar(select(Record).where(Record.kind == "memory"))
        assert fact.version == 2 and fact.data["value"] == "English"
        assert (
            await db.scalar(
                select(func.count()).select_from(Record).where(Record.kind == "memory_revision")
            )
            == 2
        )


async def test_maintenance_rebuild_and_dream_queue_restart_safe(run_record):
    async with sessions() as db:
        db.add_all(
            [
                Record(
                    owner="owner",
                    kind="checkpoint",
                    session_id=run_record.session_id,
                    data={"cursor": i, "summary": "gold context", "consolidated": False},
                )
                for i in range(3)
            ]
        )
        await db.commit()
        await db.execute(delete(SearchDocument))
        await db.commit()
    await maintain_memory()
    await maintain_memory()
    async with sessions() as db:
        assert await db.scalar(select(func.count()).select_from(SearchDocument)) == 3
        assert (
            await db.scalar(select(func.count()).select_from(Run).where(Run.purpose == "memory"))
            == 1
        )


async def test_deleting_source_conversation_removes_derived_preferences(monkeypatch, run_record):
    from test_api import client

    async with sessions() as db:
        checkpoint = Record(
            owner="owner",
            kind="checkpoint",
            session_id=run_record.session_id,
            data={"summary": "gold format preference", "cursor": 1},
        )
        db.add(checkpoint)
        run = await db.get(Run, run_record.id)
        run.status = "completed"
        await db.commit()
    await revise_fact("owner", "USER.report_format", "Use concise reports", checkpoint.id)
    async with await client(monkeypatch) as c:
        assert (await c.delete("/conversations/" + run_record.session_id)).status_code == 200
    async with sessions() as db:
        assert not (
            await db.scalars(select(Record).where(Record.kind.in_(["memory", "memory_revision"])))
        ).all()
    assert (await search("owner", MemorySearch(query="gold concise")))["results"] == []
