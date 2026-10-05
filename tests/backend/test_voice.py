from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, MagicMock

import pytest
from newlora.contracts import ModelSelection, Preferences
from newlora.db import Record, Usage, sessions
from newlora.security import PublicError
from newlora.voice import create_voice
from sqlalchemy import select


def sdk(monkeypatch, model):
    monkeypatch.setattr(
        "newlora.voice.preferences",
        AsyncMock(return_value=Preferences(voice=ModelSelection(provider="openai", model=model))),
    )
    monkeypatch.setattr("newlora.voice.validate_selection", AsyncMock())
    monkeypatch.setattr(
        "newlora.voice.credential", AsyncMock(return_value={"key": "server-secret"})
    )
    client = MagicMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr("newlora.voice.AsyncOpenAI", lambda **kwargs: client)
    return client


async def test_live_broker_never_returns_permanent_key_or_reasoning(monkeypatch):
    client = sdk(monkeypatch, "gpt-live-1")
    result = MagicMock()
    result.model_dump.return_value = {
        "session": {"id": "provider-session"},
        "transport": {"type": "webrtc", "sdp": "answer"},
    }
    client.live.create = AsyncMock(return_value=result)
    response = await create_voice("owner", "offer")
    assert response["transport"]["sdp"] == "answer"
    assert "server-secret" not in str(response)
    sent = client.live.create.call_args.kwargs
    assert sent["session"]["store"] is False
    public_events = sent["session"]["client"]["data_channel"]["allowed_server_events"]
    assert not any("reason" in str(e) or "thinking" in str(e) for e in public_events)
    async with sessions() as db:
        voice = await db.get(Record, response["id"])
        assert voice.data["status"] == "pending"
        usage = await db.scalar(select(Usage))
        assert usage.agent_type == "voice" and usage.total_tokens is None


async def test_realtime_ephemeral_authorization_uses_official_resource(monkeypatch):
    client = sdk(monkeypatch, "gpt-realtime-2.1")
    client.realtime.client_secrets.create = AsyncMock(
        return_value=NS(value="ephemeral-test", expires_at=123)
    )
    response = await create_voice("owner")
    assert response["value"] == "ephemeral-test"
    sent = client.realtime.client_secrets.create.call_args.kwargs
    assert sent["expires_after"]["seconds"] == 60
    assert sent["session"]["tools"][0]["name"] == "research"
    assert sent["session"]["audio"]["input"]["turn_detection"]["interrupt_response"]


async def test_voice_cannot_attach_another_owners_conversation(monkeypatch):
    client = sdk(monkeypatch, "gpt-live-1")
    async with sessions() as db:
        conversation = Record(owner="someone-else", kind="conversation", data={})
        db.add(conversation)
        await db.commit()
    with pytest.raises(PublicError, match="conversation_not_found"):
        await create_voice("owner", "offer", conversation.id)
    client.live.create.assert_not_called()


async def test_realtime_broker_uses_trusted_provider_call_id(monkeypatch):
    client = sdk(monkeypatch, "gpt-realtime-2.1")
    client.realtime.calls.create = AsyncMock(
        return_value=NS(
            response=NS(headers={"location": "/v1/realtime/calls/rtc_verified"}), text="answer-sdp"
        )
    )
    response = await create_voice("owner", "offer-sdp")
    assert response["mode"] == "realtime_brokered"
    assert response["transport"]["sdp"] == "answer-sdp" and "value" not in response
    async with sessions() as db:
        row = await db.get(Record, response["id"])
        assert row.data["providerId"] == "rtc_verified" and row.data["status"] == "pending"


async def test_realtime_usage_is_provider_sourced_and_idempotent(monkeypatch):
    from newlora.voice import record_realtime_usage

    async with sessions() as db:
        row = Record(
            owner="owner", kind="voice", data={"fence": "lease", "model": "gpt-realtime-2.1"}
        )
        db.add(row)
        await db.commit()
    response = NS(
        id="provider-response",
        status="completed",
        usage=NS(
            input_tokens=120,
            output_tokens=30,
            total_tokens=150,
            input_token_details=NS(cached_tokens=20),
        ),
    )
    await record_realtime_usage(row, response)
    await record_realtime_usage(row, response)
    async with sessions() as db:
        rows = (await db.scalars(select(Usage))).all()
        assert len(rows) == 1 and rows[0].total_tokens == 150
        assert rows[0].cost is None and rows[0].cached_input_tokens == 20


async def test_live_rejects_missing_provider_session_identity(monkeypatch):
    client = sdk(monkeypatch, "gpt-live-1")
    result = MagicMock()
    result.model_dump.return_value = {"session": {}, "transport": {"sdp": "answer"}}
    client.live.create = AsyncMock(return_value=result)
    with pytest.raises(PublicError, match="voice_unavailable"):
        await create_voice("owner", "offer")


async def test_voice_cancellation_is_owned_idempotent_and_blocks_research(monkeypatch, run_record):
    from test_api import client as api_client

    async with sessions() as db:
        row = Record(
            owner="owner",
            kind="voice",
            session_id=run_record.session_id,
            data={"status": "connected", "fence": "old"},
        )
        foreign = Record(owner="other", kind="voice", data={"status": "connected"})
        db.add_all([row, foreign])
        await db.commit()
    async with await api_client(monkeypatch) as c:
        assert (await c.post("/voice/" + foreign.id + "/stop")).status_code == 404
        assert (await c.post("/voice/" + row.id + "/stop")).status_code == 200
        assert (await c.post("/voice/" + row.id + "/stop")).status_code == 200
        result = await c.post(
            "/voice/" + row.id + "/research", json={"callId": "event", "objective": "gold"}
        )
        assert result.status_code == 409


async def test_missing_response_id_and_stale_voice_fence_cannot_record_usage():
    from newlora.voice import record_realtime_usage

    async with sessions() as db:
        row = Record(
            owner="owner", kind="voice", data={"fence": "lease", "model": "gpt-realtime-2.1"}
        )
        db.add(row)
        await db.commit()
    await record_realtime_usage(row, NS(id=None))
    async with sessions() as db:
        current = await db.get(Record, row.id)
        current.data = {**current.data, "fence": "replacement"}
        await db.commit()
    await record_realtime_usage(row, NS(id="provider-response"))
    async with sessions() as db:
        assert not (await db.scalars(select(Usage))).all()
