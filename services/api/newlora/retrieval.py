"""Owner-scoped durable retrieval, maintained in the same transaction as its source."""

import re

from pydantic import AwareDatetime, Field
from sqlalchemy import event, func, or_, select
from sqlalchemy.orm import Session

from .contracts import Contract
from .db import Message, Record, SearchDocument, Task, now, sessions, uid
from .providers.base import public_text

SECRET = re.compile(
    r"(?i)(?:sk-[a-z0-9_-]{8,}|bearer\s+\S+|(?:api[_ -]?key|password|secret|token|كلمة المرور|مفتاح الواجهة)\s*[:=]\s*\S+|-----BEGIN [A-Z ]*PRIVATE KEY-----)"
)
KINDS = {
    "checkpoint",
    "recommendation",
    "recommendation_revision",
    "artifact",
    "memory",
    "memory_revision",
    "subagent",
}


def safe_summary(value: str) -> str:
    return SECRET.sub("[redacted]", public_text(value))[:16000]


def summarize(data: dict) -> str:
    # Explicit public fields only: no credentials, chart bytes, arbitrary tool arguments or reasoning.
    parts = []
    for key in (
        "summary",
        "rationale_summary",
        "title",
        "text",
        "findings",
        "objective",
        "value",
        "key",
        "instrument",
        "timeframe",
        "status",
        "direction",
    ):
        if isinstance(data.get(key), str):
            parts.append(data[key])
    for key in ("before", "after", "data"):
        if isinstance(data.get(key), dict):
            parts.append(summarize(data[key]))
    return safe_summary("\n".join(parts))


@event.listens_for(Session, "before_flush")
def index_changes(session, flush_context, instances):
    for row in list(session.new) + list(session.dirty):
        if isinstance(row, Record) and row.kind in KINDS:
            row.id = row.id or uid()
            data = row.data or {}
            nested = data.get("after") or data.get("data") or {}
            document_id, resource_id = "record:" + row.id, row.id
            kind, summary = row.kind, summarize(data)
            instrument = data.get("instrument") or nested.get("instrument")
            owner, session_id = row.owner, row.session_id
        elif isinstance(row, Message) and row.role == "assistant":
            conversation = session.get(Record, row.session_id)
            if not conversation:
                continue
            row.client_id = row.client_id or uid()
            document_id = "message:" + row.session_id + ":" + row.client_id
            resource_id, kind = row.client_id, "analysis"
            summary, owner, session_id = (
                safe_summary(row.content),
                conversation.owner,
                row.session_id,
            )
            match = re.search(r"\b[A-Z]{3}_[A-Z]{3}\b", summary)
            instrument = match.group(0) if match else None
        elif isinstance(row, Task) and row.latest_result:
            row.id = row.id or uid()
            # Each check is a historical result rather than overwriting the previous check.
            document_id = "outcome:" + row.id + ":" + (row.latest_check or now()).isoformat()
            resource_id, kind = row.id, "monitoring_outcome"
            summary, owner, session_id = safe_summary(row.latest_result), row.owner, row.session_id
            instrument = row.config.get("instrument")
        else:
            continue
        doc = session.get(SearchDocument, document_id)
        if not doc:
            doc = SearchDocument(
                id=document_id,
                owner=owner,
                session_id=session_id,
                resource_id=resource_id,
                resource_type=kind,
                created_at=row.created_at or now(),
            )
            session.add(doc)
        doc.summary, doc.instrument, doc.updated_at = summary, instrument, now()


class MemorySearch(Contract):
    query: str = Field(min_length=1, max_length=1000)
    instrument: str | None = Field(default=None, pattern=r"^[A-Z0-9_]{3,24}$")
    since: AwareDatetime | None = None
    until: AwareDatetime | None = None
    resource_types: list[str] = Field(default_factory=list, max_length=12)
    limit: int = Field(default=8, ge=1, le=30)


async def search(owner: str, args: MemorySearch) -> dict:
    async with sessions() as db:
        query = select(SearchDocument).where(SearchDocument.owner == owner)
        if args.instrument:
            query = query.where(SearchDocument.instrument == args.instrument)
        if args.since:
            query = query.where(SearchDocument.created_at >= args.since)
        if args.until:
            query = query.where(SearchDocument.created_at <= args.until)
        if args.resource_types:
            query = query.where(SearchDocument.resource_type.in_(args.resource_types))
        tokens = list(dict.fromkeys(re.findall(r"[\w]+", args.query.lower())))[:24]
        if not tokens:
            return {"results": []}
        if db.bind.dialect.name == "postgresql":
            vector = func.to_tsvector("simple", SearchDocument.summary)
            terms = func.websearch_to_tsquery("simple", " OR ".join(tokens))
            query = query.where(vector.op("@@")(terms)).order_by(
                func.ts_rank_cd(vector, terms).desc()
            )
        else:
            matches = [SearchDocument.summary.icontains(t, autoescape=True) for t in tokens]
            query = query.where(or_(*matches))
        rows = (
            await db.scalars(query.order_by(SearchDocument.created_at.desc()).limit(args.limit))
        ).all()
        return {
            "results": [
                {
                    "resourceId": r.resource_id,
                    "resourceType": r.resource_type,
                    "sessionId": r.session_id,
                    "timestamp": r.created_at.isoformat(),
                    "instrument": r.instrument,
                    "summary": r.summary[:4000],
                    "reference": {
                        "conversationId": r.session_id,
                        "resourceId": r.resource_id,
                        "resourceType": r.resource_type,
                    },
                }
                for r in rows
            ],
            "retrievedAt": now().isoformat(),
            "untrusted": True,
        }
