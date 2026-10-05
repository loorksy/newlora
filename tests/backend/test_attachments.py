import io
import json

import pytest
from newlora.attachments import message_inputs, parse, path
from newlora.db import Message, Record, Run, SearchDocument, sessions
from newlora.security import PublicError, issue_tokens
from PIL import Image
from pypdf import PdfWriter
from sqlalchemy import select
from test_api import client


def png():
    out = io.BytesIO()
    Image.new("RGB", (8, 8), "green").save(out, format="PNG")
    return out.getvalue()


async def test_upload_multimodal_ownership_and_conversation_cleanup(monkeypatch):
    async with await client(monkeypatch) as c:
        session = (await c.post("/conversations", json={"title": "attachments"})).json()["id"]
        response = await c.post(
            f"/conversations/{session}/attachments",
            files={"file": ("../../evil.png", png(), "image/png")},
        )
        assert response.status_code == 200
        data = response.json()
        assert ".." not in data["name"] and path(data["id"]).exists()
        message = await c.post(
            f"/conversations/{session}/messages",
            json={
                "clientId": "attachment-message",
                "text": "حلل هذه الصورة",
                "attachmentIds": [data["id"]],
            },
        )
        assert message.status_code == 200
        async with sessions() as db:
            row = await db.scalar(select(Message).where(Message.session_id == session))
            inputs = await message_inputs("owner", row)
            assert inputs["images"][0].startswith("data:image/png;base64,")
            assert "/data/" not in str(inputs)
            run = await db.get(Run, message.json()["runId"])
            run.status = "completed"
            await db.commit()
        other = (await issue_tokens("other"))["accessToken"]
        assert (
            await c.get("/attachments/" + data["id"], headers={"Authorization": "Bearer " + other})
        ).status_code == 404
        assert (
            await c.post(
                f"/conversations/{session}/attachments",
                headers={"Authorization": "Bearer " + other},
                files={"file": ("x.png", png(), "image/png")},
            )
        ).status_code == 404
        assert (await c.delete("/attachments/" + data["id"])).status_code == 409
        assert (await c.delete("/conversations/" + session)).status_code == 200
        assert not path(data["id"]).exists()
        async with sessions() as db:
            assert not (
                await db.scalars(select(SearchDocument).where(SearchDocument.session_id == session))
            ).all()


@pytest.mark.parametrize(
    "mime,raw,code",
    [
        ("application/x-executable", b"ELF", "attachment_type_unsupported"),
        ("image/png", b"not-an-image", "attachment_invalid"),
        ("image/jpeg", png(), "attachment_invalid"),
        ("text/plain", b"abc\x00def", "attachment_invalid"),
        ("application/pdf", b"not-a-pdf", "attachment_invalid"),
        ("text/plain", b"x" * 8_000_001, "attachment_too_large"),
    ],
)
def test_parser_rejects_unsafe_invalid_and_oversized(mime, raw, code):
    with pytest.raises(PublicError, match=code):
        parse(raw, mime)


def test_text_csv_and_pdf_extraction_bounds():
    assert len(json.loads(parse(b"x" * 30000, "text/plain"))["text"]) == 24000
    assert json.loads(parse(b"a,b\n1,2", "text/csv"))["text"] == "a,b\n1,2"
    pdf = PdfWriter()
    for _ in range(30):
        pdf.add_blank_page(width=100, height=100)
    out = io.BytesIO()
    pdf.write(out)
    extracted = json.loads(parse(out.getvalue(), "application/pdf"))
    assert extracted["bounded"] and len(extracted["text"]) <= 24000


async def test_upload_text_encrypted_and_cross_chat_attachment_rejected(monkeypatch):
    async with await client(monkeypatch) as c:
        first = (await c.post("/conversations", json={"title": "one"})).json()["id"]
        second = (await c.post("/conversations", json={"title": "two"})).json()["id"]
        uploaded = await c.post(
            f"/conversations/{first}/attachments",
            files={"file": ("report.txt", b"private document text", "text/plain")},
        )
        assert uploaded.status_code == 200
        aid = uploaded.json()["id"]
        async with sessions() as db:
            assert "private document text" not in str((await db.get(Record, aid)).data)
        result = await c.post(
            f"/conversations/{second}/messages",
            json={"clientId": "attachment-wrong-chat", "attachmentIds": [aid]},
        )
        assert result.status_code == 404
        assert (await c.delete("/attachments/" + aid)).status_code == 200
        assert not path(aid).exists()


async def test_upload_mime_rejection_and_bounded_chunked_request(monkeypatch):
    async with await client(monkeypatch) as c:
        session = (await c.post("/conversations", json={"title": ""})).json()["id"]
        result = await c.post(
            f"/conversations/{session}/attachments",
            files={"file": ("malware.exe", b"MZbinary", "application/x-msdownload")},
        )
        assert result.status_code == 415 and "MZbinary" not in result.text

        async def stream():
            for _ in range(9):
                yield b"x" * 1_000_000

        result = await c.post(f"/conversations/{session}/attachments", content=stream())
        assert result.status_code == 413
