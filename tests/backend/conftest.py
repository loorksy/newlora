import os

import pytest
from argon2 import PasswordHasher
from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

os.environ.update(
    MASTER_KEY=Fernet.generate_key().decode(),
    JWT_SECRET="test-secret-" * 5,
    OWNER_PASSWORD_HASH=PasswordHasher().hash("test-password-only"),
    BROWSER_TOKEN="test-browser-token",
    DATABASE_URL="sqlite+aiosqlite://",
)


@pytest.fixture(autouse=True)
async def database(tmp_path, monkeypatch):
    from newlora import db
    from newlora.config import settings

    settings.cache_clear()
    monkeypatch.setenv("ARTIFACT_DIR", str(tmp_path / "artifacts"))
    engine = create_async_engine(
        os.environ.get("TEST_DATABASE_URL", "sqlite+aiosqlite:///" + str(tmp_path / "test.db"))
    )
    async with engine.begin() as conn:
        await conn.run_sync(db.Base.metadata.drop_all)
        await conn.run_sync(db.Base.metadata.create_all)
    monkeypatch.setattr(db, "_engine", engine)
    monkeypatch.setattr(db, "_factory", async_sessionmaker(engine, expire_on_commit=False))
    yield
    await engine.dispose()


@pytest.fixture
async def run_record():
    from datetime import timedelta

    from newlora.db import Record, Run, now, sessions, uid

    async with sessions() as db:
        conversation = Record(owner="owner", kind="conversation", data={"title": "اختبار"})
        db.add(conversation)
        await db.flush()
        run = Run(
            owner="owner",
            session_id=conversation.id,
            request_key=uid(),
            objective="حلل الذهب",
            status="running",
            fence=uid(),
            lease_until=now() + timedelta(minutes=5),
        )
        db.add(run)
        await db.commit()
        return run
