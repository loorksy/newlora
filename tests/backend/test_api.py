from unittest.mock import AsyncMock, MagicMock

import httpx
from newlora.api import app
from newlora.db import Credential, Record, sessions
from newlora.security import issue_tokens
from sqlalchemy import select


async def client(monkeypatch):
    redis = MagicMock()
    redis.incr = AsyncMock(return_value=1)
    redis.expire = AsyncMock()
    redis.aclose = AsyncMock()
    monkeypatch.setattr("newlora.api.Redis.from_url", lambda *a: redis)
    token = (await issue_tokens())["accessToken"]
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="https://test",
        headers={"Authorization": "Bearer " + token},
    )


async def test_api_secret_response_and_owner_isolation(monkeypatch):
    async with await client(monkeypatch) as c:
        r = await c.put("/settings/credentials/openai", json={"key": "real-looking-test-secret"})
        assert r.status_code == 200 and "real-looking-test-secret" not in r.text
        saved = await c.get("/settings")
        assert saved.json()["credentials"]["openai"]["lastFour"] == "cret"
        async with sessions() as db:
            row = await db.scalar(select(Credential))
            assert "real-looking" not in row.ciphertext
            private = Record(owner="other", kind="conversation", data={"title": "private"})
            db.add(private)
            await db.commit()
        assert (await c.get("/conversations/" + private.id)).status_code == 404
        invalid = await c.put(
            "/settings/credentials/openai", json={"key": "short", "unexpected": "secret-input"}
        )
        assert invalid.status_code == 422 and "secret-input" not in invalid.text


async def test_chat_idempotency_and_selection_round_trip(monkeypatch):
    async with await client(monkeypatch) as c:
        conversation = (await c.post("/conversations", json={"title": ""})).json()
        path = "/conversations/" + conversation["id"] + "/messages"
        data = {"clientId": "stable-request-id", "text": "حلل الذهب"}
        first = await c.post(path, json=data)
        second = await c.post(path, json=data)
        assert first.json() == second.json()
        history = (await c.get("/conversations/" + conversation["id"])).json()
        assert len(history["messages"]) == 1
        async with sessions() as db:
            artifact = Record(
                owner="owner",
                session_id=conversation["id"],
                kind="artifact",
                data={
                    "type": "select_item",
                    "title": "Choose",
                    "data": {"options": [{"id": "gold", "label": "الذهب"}]},
                },
            )
            db.add(artifact)
            await db.commit()
        response = await c.post(
            "/artifacts/" + artifact.id + "/select",
            json={"clientId": "selection-id", "itemId": "gold"},
        )
        assert response.status_code == 200
        history = (await c.get("/conversations/" + conversation["id"])).json()
        assert "select_item" in history["messages"][-1]["text"]


async def test_unauthenticated_api_is_rejected(monkeypatch):
    async with await client(monkeypatch) as c:
        c.headers.clear()
        assert (await c.get("/settings")).status_code == 401
