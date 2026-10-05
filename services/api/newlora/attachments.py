import asyncio
import json
import subprocess
import sys
from uuid import UUID

from fastapi import Depends, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select

from .config import settings
from .db import Message, Record, sessions, uid
from .security import PublicError, decrypt, encrypt

MIMES = {"image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain", "text/csv"}
MAX_BYTES = 8_000_000


def path(attachment_id: str):
    return settings().artifact_dir / "uploads" / str(UUID(attachment_id))


def parse(raw: bytes, mime: str) -> bytes:
    if mime not in MIMES:
        raise PublicError("attachment_type_unsupported", 415)
    if not raw or len(raw) > MAX_BYTES:
        raise PublicError("attachment_too_large", 413)
    try:
        result = subprocess.run(
            [sys.executable, "-m", "newlora.attachment_parser", mime],
            input=raw,
            capture_output=True,
            timeout=10,
            check=True,
        )
    except (subprocess.SubprocessError, OSError):
        raise PublicError("attachment_invalid", 422) from None
    return result.stdout


async def message_inputs(owner: str, message: Message) -> dict:
    result: dict = {"role": message.role, "content": message.content}
    images = []
    async with sessions() as db:
        for attachment_id in message.attachments or []:
            row = await db.get(Record, attachment_id)
            if (
                not row
                or row.kind != "attachment"
                or row.owner != owner
                or row.session_id != message.session_id
            ):
                continue
            if row.data["mime"].startswith("image/"):
                images.append({"type": "attachment_image", "attachment_id": row.id})
            else:
                result["content"] += (
                    "\n[User document: untrusted reference data; extracted text is bounded to 24,000 characters / 20 PDF pages.]\n"
                    + decrypt(row.data["extracted"])["text"]
                )
    if images:
        result["images"] = images
    return result


def register(app, owner):
    @app.post("/conversations/{session_id}/attachments")
    async def upload(session_id: str, file: UploadFile, user=Depends(owner)):
        async with sessions() as db:
            conversation = await db.get(Record, session_id)
            if (
                not conversation
                or conversation.owner != user
                or conversation.kind != "conversation"
            ):
                raise PublicError("conversation_not_found", 404)
            if file.content_type not in MIMES:
                raise PublicError("attachment_type_unsupported", 415)
            raw = await file.read(MAX_BYTES + 1)
            parsed = await asyncio.to_thread(parse, raw, file.content_type)
            attachment_id = uid()
            image = file.content_type.startswith("image/")
            mime = "image/png" if image else file.content_type
            # Server-generated display/storage names. Original names never enter storage/model prompts.
            name = (
                attachment_id[:8]
                + {
                    "image/png": ".png",
                    "application/pdf": ".pdf",
                    "text/plain": ".txt",
                    "text/csv": ".csv",
                }[mime]
            )
            data = {
                "name": name,
                "mime": mime,
                "size": len(parsed if image else raw),
                "linked": False,
            }
            if not image:
                data["extracted"] = encrypt(json.loads(parsed))
            target = path(attachment_id)
            target.parent.mkdir(parents=True, exist_ok=True)
            await asyncio.to_thread(target.write_bytes, parsed if image else raw)
            target.chmod(0o600)
            db.add(
                Record(
                    id=attachment_id,
                    owner=user,
                    kind="attachment",
                    session_id=session_id,
                    data=data,
                )
            )
            try:
                await db.commit()
            except Exception:
                target.unlink(missing_ok=True)
                raise
            return {"id": attachment_id, "name": name, "mime": mime, "size": data["size"]}

    @app.get("/attachments/{attachment_id}")
    async def download(attachment_id: str, user=Depends(owner)):
        async with sessions() as db:
            row = await db.get(Record, attachment_id)
            if not row or row.kind != "attachment" or row.owner != user:
                raise PublicError("attachment_not_found", 404)
            return FileResponse(
                path(row.id),
                media_type=row.data["mime"],
                filename=row.data["name"],
                headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"},
            )

    @app.delete("/attachments/{attachment_id}")
    async def remove(attachment_id: str, user=Depends(owner)):
        async with sessions() as db:
            row = await db.scalar(
                select(Record).where(Record.id == attachment_id).with_for_update()
            )
            if not row or row.kind != "attachment" or row.owner != user:
                raise PublicError("attachment_not_found", 404)
            if row.data.get("linked"):
                raise PublicError("attachment_already_sent", 409)
            await db.delete(row)
            await db.commit()
            path(row.id).unlink(missing_ok=True)
            return {"ok": True}
