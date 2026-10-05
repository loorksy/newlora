from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .config import settings


def now() -> datetime:
    return datetime.now(UTC)


def uid() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class Record(Base):
    """Typed, versioned application resources; no provider credentials in JSON."""

    __tablename__ = "records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    session_id: Mapped[str | None] = mapped_column(String(160), index=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class SearchDocument(Base):
    __tablename__ = "search_documents"
    __table_args__ = (
        Index(
            "ix_search_documents_fts",
            text("to_tsvector('simple'::regconfig, summary)"),
            postgresql_using="gin",
        ).ddl_if(dialect="postgresql"),
    )
    id: Mapped[str] = mapped_column(String(180), primary_key=True)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    session_id: Mapped[str | None] = mapped_column(String(160), index=True)
    resource_id: Mapped[str] = mapped_column(String(160))
    resource_type: Mapped[str] = mapped_column(String(40), index=True)
    instrument: Mapped[str | None] = mapped_column(String(24), index=True)
    summary: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Credential(Base):
    __tablename__ = "credentials"
    __table_args__ = (UniqueConstraint("owner", "provider"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    owner: Mapped[str] = mapped_column(String(64))
    provider: Mapped[str] = mapped_column(String(20))
    ciphertext: Mapped[str] = mapped_column(Text)
    last_four: Mapped[str] = mapped_column(String(4))
    status: Mapped[str] = mapped_column(String(20), default="untested")


class DeviceSession(Base):
    __tablename__ = "device_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    owner: Mapped[str] = mapped_column(String(64))
    refresh_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (UniqueConstraint("session_id", "client_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("records.id", ondelete="CASCADE"), index=True
    )
    client_id: Mapped[str] = mapped_column(String(100), default=uid)
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    attachments: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Run(Base):
    __tablename__ = "runs"
    __table_args__ = (UniqueConstraint("owner", "request_key"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("records.id", ondelete="CASCADE"), index=True
    )
    request_key: Mapped[str] = mapped_column(String(150))
    task_id: Mapped[str | None] = mapped_column(String(36))
    parent_id: Mapped[str | None] = mapped_column(String(36))
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    purpose: Mapped[str] = mapped_column(String(20), default="chat")
    objective: Mapped[str] = mapped_column(Text)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fence: Mapped[str | None] = mapped_column(String(36))
    checkpoint: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Event(Base):
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    session_id: Mapped[str | None] = mapped_column(String(36), index=True)
    run_id: Mapped[str | None] = mapped_column(String(36))
    event: Mapped[str] = mapped_column(String(40))
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Effect(Base):
    __tablename__ = "effects"
    key: Mapped[str] = mapped_column(String(180), primary_key=True)
    result: Mapped[dict] = mapped_column(JSON)


class Operation(Base):
    """A logical mutation, planned before execution and committed with its effects."""

    __tablename__ = "operations"
    id: Mapped[str] = mapped_column(String(180), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    tool: Mapped[str] = mapped_column(String(50))
    arguments: Mapped[str] = mapped_column(Text)  # encrypted public tool input
    state: Mapped[str] = mapped_column(String(20), default="planned")
    result: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    committed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("records.id", ondelete="CASCADE"))
    config: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    next_check: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    latest_check: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    latest_result: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Usage(Base):
    __tablename__ = "usage"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    session_id: Mapped[str | None] = mapped_column(String(36))
    task_id: Mapped[str | None] = mapped_column(String(36))
    run_id: Mapped[str | None] = mapped_column(String(36))
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(100))
    agent_type: Mapped[str] = mapped_column(String(20))
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    cached_input_tokens: Mapped[int | None] = mapped_column(Integer)
    cache_write_tokens: Mapped[int | None] = mapped_column(Integer)
    total_tokens: Mapped[int | None] = mapped_column(Integer)
    latency_ms: Mapped[float] = mapped_column(Float)
    first_token_ms: Mapped[float | None] = mapped_column(Float)
    success: Mapped[bool] = mapped_column(Boolean)
    request_id: Mapped[str | None] = mapped_column(String(200))
    audio_seconds: Mapped[float | None] = mapped_column(Float)
    cost: Mapped[float | None] = mapped_column(Float)
    pricing_snapshot: Mapped[dict | None] = mapped_column(JSON)
    pricing_version: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class Outbox(Base):
    __tablename__ = "outbox"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    dedupe: Mapped[str] = mapped_column(String(180), unique=True)
    owner: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fence: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


_engine = None
_factory = None


def engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(settings().database_url, pool_pre_ping=True)
    return _engine


def sessions():
    global _factory
    if _factory is None:
        _factory = async_sessionmaker(engine(), expire_on_commit=False)
    return _factory()


def record_json(row: Record) -> dict:
    return {
        "id": row.id,
        "type": row.kind,
        "version": row.version,
        "sessionId": row.session_id,
        "data": row.data,
        "createdAt": row.created_at.isoformat(),
        "updatedAt": row.updated_at.isoformat(),
    }


# Install transaction-local indexing for ORM writes. No external queue can lose an index update.
from . import retrieval as _retrieval  # noqa: E402,F401
