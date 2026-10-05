"""Durable run checkpoints store image references, never image bytes."""

import base64
import json
from typing import Any
from uuid import UUID

from .attachments import path as attachment_path
from .db import Record, sessions
from .security import PublicError

# Plaintext JSON bound, measured the same way the checkpoint is encrypted.
# Large enough for bounded tool text; far smaller than inline chart screenshots.
MAX_CHECKPOINT_BYTES = 2_000_000
MAX_IMAGE_REFS = 256
MAX_TEXT_CHARS = 100_000
MAX_MESSAGES = 500
MAX_IMAGES_PER_MESSAGE = 8
MAX_DEPTH = 12
IMAGE_BYTE_LIMIT = 15_000_000


def checkpoint_payload(messages: list[dict], step: int, answer: str | None) -> dict:
    """Return a JSON-safe checkpoint with image bytes removed."""
    if (
        not isinstance(step, int)
        or isinstance(step, bool)
        or step < 0
        or len(messages) > MAX_MESSAGES
    ):
        raise PublicError("checkpoint_too_large", 409)
    refs = 0
    images_total = 0
    durable: list[dict] = []
    for message in messages:
        if not isinstance(message, dict):
            raise PublicError("checkpoint_too_large", 409)
        item = {key: value for key, value in message.items() if key != "images"}
        _reject_unbounded(item)
        images = message.get("images") or []
        if images:
            if not isinstance(images, list) or len(images) > MAX_IMAGES_PER_MESSAGE:
                raise PublicError("checkpoint_too_large", 409)
            stored = [_image_reference(image) for image in images]
            images_total += len(stored)
            refs += sum(1 for image in stored if image["type"] != "transient_image")
            item["images"] = stored
        durable.append(item)
    if refs > MAX_IMAGE_REFS or images_total > MAX_IMAGE_REFS:
        raise PublicError("checkpoint_too_large", 409)
    if answer is not None:
        _reject_unbounded(answer)
    payload = {"messages": durable, "step": step, "answer": answer}
    encoded = json.dumps(payload).encode()
    if len(encoded) > MAX_CHECKPOINT_BYTES or b"data:image/" in encoded:
        raise PublicError("checkpoint_too_large", 409)
    return payload


def _image_reference(image: Any) -> dict:
    if isinstance(image, str):
        if image.startswith("data:image/"):
            # Browser screenshots are not durable files. The live call still has the data URL.
            return {"type": "transient_image"}
        raise PublicError("checkpoint_too_large", 409)
    if not isinstance(image, dict):
        raise PublicError("checkpoint_too_large", 409)
    kind = image.get("type")
    if kind == "transient_image":
        return {"type": "transient_image"}
    if kind == "artifact_image":
        return {"type": "artifact_image", "artifact_id": _identifier(image.get("artifact_id"))}
    if kind == "attachment_image":
        return {
            "type": "attachment_image",
            "attachment_id": _identifier(image.get("attachment_id")),
        }
    raise PublicError("checkpoint_too_large", 409)


def _identifier(value: Any) -> str:
    if not isinstance(value, str) or len(value) > 64:
        raise PublicError("checkpoint_too_large", 409)
    try:
        return str(UUID(value))
    except ValueError:
        raise PublicError("checkpoint_too_large", 409) from None


def _reject_unbounded(value: Any, depth: int = 0) -> None:
    if depth > MAX_DEPTH:
        raise PublicError("checkpoint_too_large", 409)
    if isinstance(value, str):
        if len(value) > MAX_TEXT_CHARS or "data:image/" in value:
            raise PublicError("checkpoint_too_large", 409)
        return
    if isinstance(value, dict):
        for item in value.values():
            _reject_unbounded(item, depth + 1)
        return
    if isinstance(value, list):
        for item in value:
            _reject_unbounded(item, depth + 1)
        return
    if value is None or isinstance(value, int | float | bool):
        return
    raise PublicError("checkpoint_too_large", 409)


async def hydrate_messages(owner: str, session_id: str, messages: list[dict]) -> list[dict]:
    """Copy messages and expand owned image references for one provider call."""
    output = []
    for message in messages:
        item = dict(message)
        images = message.get("images")
        if images:
            hydrated = []
            for image in images:
                url = await _hydrate_image(owner, session_id, image)
                if url:
                    hydrated.append(url)
            if hydrated:
                item["images"] = hydrated
            else:
                item.pop("images", None)
        output.append(item)
    return output


async def _hydrate_image(owner: str, session_id: str, image: Any) -> str | None:
    if isinstance(image, str):
        if image.startswith("data:image/") and "\n" not in image and len(image) <= IMAGE_BYTE_LIMIT:
            return image
        raise PublicError("image_reference_forbidden", 403)
    if not isinstance(image, dict):
        raise PublicError("image_reference_forbidden", 403)
    kind = image.get("type")
    if kind == "transient_image":
        return None
    if kind == "attachment_image":
        return await _attachment_url(owner, session_id, _safe_id(image.get("attachment_id")))
    if kind == "artifact_image":
        return await _artifact_url(owner, session_id, _safe_id(image.get("artifact_id")))
    raise PublicError("image_reference_forbidden", 403)


def _safe_id(value: Any) -> str:
    try:
        return _identifier(value)
    except PublicError:
        raise PublicError("image_reference_forbidden", 403) from None


async def _attachment_url(owner: str, session_id: str, attachment_id: str) -> str:
    async with sessions() as db:
        row = await db.get(Record, attachment_id)
        if (
            not row
            or row.owner != owner
            or row.kind != "attachment"
            or row.session_id != session_id
            or not isinstance(row.data, dict)
            or not str(row.data.get("mime", "")).startswith("image/")
        ):
            raise PublicError("image_reference_forbidden", 403)
        mime = str(row.data["mime"])
    raw = _read_image(attachment_path(attachment_id), "attachment_not_found")
    return "data:" + mime + ";base64," + base64.b64encode(raw).decode()


async def _artifact_url(owner: str, session_id: str, artifact_id: str) -> str:
    from .agent_tools import artifact_path

    async with sessions() as db:
        row = await db.get(Record, artifact_id)
        payload = row.data.get("data") if row and isinstance(row.data, dict) else None
        if (
            not row
            or row.owner != owner
            or row.kind != "artifact"
            or row.session_id != session_id
            or not isinstance(payload, dict)
            or payload.get("imageId") != artifact_id
        ):
            raise PublicError("image_reference_forbidden", 403)
    raw = _read_image(artifact_path(artifact_id), "chart_image_missing")
    return "data:image/png;base64," + base64.b64encode(raw).decode()


def _read_image(target, code: str) -> bytes:
    if not target.is_file():
        raise PublicError(code, 404)
    size = target.stat().st_size
    if size <= 0 or size > IMAGE_BYTE_LIMIT:
        raise PublicError("checkpoint_too_large", 409)
    return target.read_bytes()
