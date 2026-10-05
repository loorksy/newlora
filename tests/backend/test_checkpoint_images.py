import base64
import json
from datetime import timedelta
from uuid import uuid4

import pytest
from newlora.attachments import message_inputs, path
from newlora.checkpoints import MAX_IMAGE_REFS, MAX_TEXT_CHARS, hydrate_messages
from newlora.config import settings
from newlora.contracts import ModelSelection, Preferences
from newlora.db import Credential, Message, Record, Run, now, sessions, uid
from newlora.jobs import claim
from newlora.providers.base import Reply, ToolCall
from newlora.runtime import Runtime
from newlora.security import PublicError, decrypt, encrypt


class Crash(BaseException):
    pass


def prefs():
    return Preferences(main=ModelSelection(provider="openai", model="gpt-6.1-sol"))


async def credential():
    async with sessions() as db:
        db.add(
            Credential(
                owner="owner",
                provider="openai",
                ciphertext=encrypt({"key": "test-key"}),
                last_four="tkey",
            )
        )
        await db.commit()


def install_model(monkeypatch, replies):
    class Model:
        def __init__(self):
            self.seen = []

        async def close(self):
            pass

        async def complete(self, model, messages, tools, **kwargs):
            self.seen.append(messages)
            reply = replies[len(self.seen) - 1]
            if isinstance(reply, BaseException):
                raise reply
            return reply

    model = Model()
    monkeypatch.setattr("newlora.runtime.provider", lambda *_args: model)
    return model


async def test_text_only_checkpoint_is_unchanged(run_record, monkeypatch):
    await credential()
    install_model(monkeypatch, [Reply(text="Plain answer")])
    runtime = Runtime(run_record, prefs())
    assert await runtime.loop([{"role": "user", "content": "hello"}]) == "Plain answer"
    async with sessions() as db:
        checkpoint = (await db.get(Run, run_record.id)).checkpoint
    state = decrypt(checkpoint)
    assert state["answer"] == "Plain answer"
    assert state["messages"][0] == {"role": "user", "content": "hello"}
    assert "images" not in json.dumps(state)
    assert "data:image/" not in checkpoint and "data:image/" not in json.dumps(state)


async def test_uploaded_image_checkpoint_rehydrates_after_crash(run_record, monkeypatch):
    await credential()
    raw = b"\x89PNG\r\nuser-chart-bytes"
    attachment_id = uid()
    target = path(attachment_id)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(raw)
    async with sessions() as db:
        db.add(
            Record(
                id=attachment_id,
                owner="owner",
                kind="attachment",
                session_id=run_record.session_id,
                data={"name": "a.png", "mime": "image/png", "size": len(raw), "linked": True},
            )
        )
        await db.commit()
    message = Message(
        session_id=run_record.session_id,
        role="user",
        content="inspect",
        attachments=[attachment_id],
    )
    inputs = await message_inputs("owner", message)
    assert inputs["images"] == [{"type": "attachment_image", "attachment_id": attachment_id}]
    model = install_model(
        monkeypatch,
        [
            Reply(calls=[ToolCall("next", "market_sessions", {})]),
            Crash(),
            Reply(text="recovered visual answer"),
        ],
    )
    runtime = Runtime(run_record, prefs())
    with pytest.raises(Crash):
        await runtime.loop([inputs])
    assert model.seen[0][0]["images"] == ["data:image/png;base64," + base64.b64encode(raw).decode()]
    async with sessions() as db:
        saved = decrypt((await db.get(Run, run_record.id)).checkpoint)
        ciphertext = (await db.get(Run, run_record.id)).checkpoint
    assert "data:image/" not in ciphertext and "data:image/" not in json.dumps(saved)
    assert base64.b64encode(raw).decode() not in json.dumps(saved)
    assert saved["messages"][0]["images"] == [
        {"type": "attachment_image", "attachment_id": attachment_id}
    ]
    async with sessions() as db:
        row = await db.get(Run, run_record.id)
        row.lease_until = now() - timedelta(seconds=1)
        await db.commit()
    replacement = Runtime(await claim(), prefs())
    assert await replacement.loop([]) == "recovered visual answer"
    assert model.seen[-1][0]["images"] == [
        "data:image/png;base64," + base64.b64encode(raw).decode()
    ]
    assert settings().artifact_dir.as_posix() not in json.dumps(model.seen[-1])


async def test_hydration_preserves_ownership(run_record):
    raw = b"\x89PNG\r\nowned"
    foreign_id, other_session = uid(), uid()
    for attachment_id, owner, session_id in (
        (foreign_id, "other", run_record.session_id),
        (other_session, "owner", uid()),
    ):
        target = path(attachment_id)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        async with sessions() as db:
            db.add(
                Record(
                    id=attachment_id,
                    owner=owner,
                    kind="attachment",
                    session_id=session_id,
                    data={"name": "a.png", "mime": "image/png", "size": len(raw), "linked": True},
                )
            )
            await db.commit()
        with pytest.raises(PublicError, match="image_reference_forbidden"):
            await hydrate_messages(
                "owner",
                run_record.session_id,
                [
                    {
                        "role": "user",
                        "content": "x",
                        "images": [{"type": "attachment_image", "attachment_id": attachment_id}],
                    }
                ],
            )
    artifact_id = uid()
    image = settings().artifact_dir / f"{artifact_id}.png"
    image.parent.mkdir(parents=True, exist_ok=True)
    image.write_bytes(raw)
    async with sessions() as db:
        db.add(
            Record(
                id=artifact_id,
                owner="other",
                kind="artifact",
                session_id=run_record.session_id,
                data={"type": "chart", "title": "x", "data": {"imageId": artifact_id}},
            )
        )
        await db.commit()
    with pytest.raises(PublicError, match="image_reference_forbidden"):
        await hydrate_messages(
            "owner",
            run_record.session_id,
            [
                {
                    "role": "user",
                    "content": "x",
                    "images": [{"type": "artifact_image", "artifact_id": artifact_id}],
                }
            ],
        )


async def test_transient_screenshot_is_not_stored_or_rehydrated(run_record, monkeypatch):
    await credential()
    pixels = "data:image/png;base64," + ("Q" * 4000)

    async def execute(name, args):
        assert name == "browser_screenshot"
        return {"title": "example", "_images": [pixels]}

    model = install_model(
        monkeypatch,
        [
            Reply(calls=[ToolCall("shot", "browser_screenshot", {"url": "https://example.com"})]),
            Crash(),
            Reply(text="continued without pixels"),
        ],
    )
    runtime = Runtime(run_record, prefs())
    runtime.tools.execute = execute
    with pytest.raises(Crash):
        await runtime.loop([{"role": "user", "content": "open"}])
    assert pixels in json.dumps(model.seen[1])
    async with sessions() as db:
        row = await db.get(Run, run_record.id)
        state = decrypt(row.checkpoint)
        assert "data:image/" not in row.checkpoint and "data:image/" not in json.dumps(state)
        assert "Q" * 40 not in json.dumps(state)
        assert {"type": "transient_image"} in state["messages"][-1]["images"]
        row.lease_until = now() - timedelta(seconds=1)
        await db.commit()
    replacement = Runtime(await claim(), prefs())
    assert await replacement.loop([]) == "continued without pixels"
    assert pixels not in json.dumps(model.seen[-1])
    assert "data:image/" not in json.dumps(model.seen[-1])


async def test_oversized_checkpoint_fails_without_writing(run_record):
    runtime = Runtime(run_record, prefs())
    with pytest.raises(PublicError, match="checkpoint_too_large"):
        await runtime.save_checkpoint([{"role": "user", "content": "x" * (MAX_TEXT_CHARS + 1)}], 1)
    images = [
        {"type": "attachment_image", "attachment_id": str(uuid4())}
        for _ in range(MAX_IMAGE_REFS + 1)
    ]
    with pytest.raises(PublicError, match="checkpoint_too_large"):
        await runtime.save_checkpoint([{"role": "user", "content": "x", "images": images}], 1)
    with pytest.raises(PublicError, match="checkpoint_too_large"):
        await runtime.save_checkpoint(
            [{"role": "user", "content": "look data:image/png;base64,AAAA"}], 1
        )
    async with sessions() as db:
        assert (await db.get(Run, run_record.id)).checkpoint is None
