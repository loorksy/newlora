"""Durable run checkpoints store image references, never image bytes."""

import base64
import json
from collections.abc import Callable
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
# Provider-call bounds. These stop one resumed context from expanding every stored
# reference into memory. They are infrastructure limits, not trading rules.
MAX_PROVIDER_IMAGES = 12
MAX_PROVIDER_IMAGE_BYTES = 32 * 1024 * 1024
MAX_PROVIDER_PAYLOAD_BYTES = 48 * 1024 * 1024
TRANSIENT_SCREENSHOT_UNAVAILABLE = (
    "The transient screenshot from a previous worker is unavailable after restart. "
    "Reacquire it before making visual claims."
)


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
    """Copy messages and expand owned image references for one provider call.

    The returned list is complete or the call fails. A limit never drops some images
    and sends the rest. Transient screenshots are not provider images: when a message
    contains only those markers, its text no longer tells the model to inspect them.
    """
    prepared: list[tuple[dict, list[Callable[[], str]]]] = []
    image_count = 0
    raw_total = 0
    payload_total = 0
    for message in messages:
        item = dict(message)
        images = message.get("images")
        loaders: list[Callable[[], str]] = []
        if images:
            if not isinstance(images, list):
                raise PublicError("image_reference_forbidden", 403)
            if all(_is_transient(image) for image in images):
                item.pop("images", None)
                item["content"] = TRANSIENT_SCREENSHOT_UNAVAILABLE
            else:
                for image in images:
                    if _is_transient(image):
                        continue
                    raw, payload, loader = await _plan_image(owner, session_id, image)
                    image_count += 1
                    raw_total += raw
                    payload_total += payload
                    if (
                        image_count > MAX_PROVIDER_IMAGES
                        or raw_total > MAX_PROVIDER_IMAGE_BYTES
                        or payload_total > MAX_PROVIDER_PAYLOAD_BYTES
                    ):
                        raise PublicError("multimodal_payload_too_large", 409)
                    loaders.append(loader)
                if not loaders:
                    item.pop("images", None)
        prepared.append((item, loaders))
    output = []
    for item, loaders in prepared:
        if loaders:
            item["images"] = [loader() for loader in loaders]
        output.append(item)
    return output


def _is_transient(image: Any) -> bool:
    return isinstance(image, dict) and image.get("type") == "transient_image"


async def _plan_image(
    owner: str, session_id: str, image: Any
) -> tuple[int, int, Callable[[], str]]:
    """Validate one image and measure it without reading file bytes."""
    if isinstance(image, str):
        if image.startswith("data:image/") and "\n" not in image and len(image) <= IMAGE_BYTE_LIMIT:
            raw, payload = _data_url_sizes(image)
            return raw, payload, lambda: image
        raise PublicError("image_reference_forbidden", 403)
    if not isinstance(image, dict):
        raise PublicError("image_reference_forbidden", 403)
    kind = image.get("type")
    if kind == "attachment_image":
        target, mime, size = await _attachment_file(
            owner, session_id, _safe_id(image.get("attachment_id"))
        )
        return (
            size,
            _encoded_size(mime, size),
            lambda: _encode_file(target, mime, "attachment_not_found"),
        )
    if kind == "artifact_image":
        target, size = await _artifact_file(owner, session_id, _safe_id(image.get("artifact_id")))
        return (
            size,
            _encoded_size("image/png", size),
            lambda: _encode_file(target, "image/png", "chart_image_missing"),
        )
    raise PublicError("image_reference_forbidden", 403)


def _data_url_sizes(url: str) -> tuple[int, int]:
    marker = ";base64,"
    index = url.find(marker)
    if index == -1:
        return len(url), len(url)
    body = url[index + len(marker) :]
    padding = len(body) - len(body.rstrip("="))
    return max(0, (len(body) * 3) // 4 - padding), len(url)


def _encoded_size(mime: str, raw_size: int) -> int:
    return len("data:") + len(mime) + len(";base64,") + 4 * ((raw_size + 2) // 3)


def _safe_id(value: Any) -> str:
    try:
        return _identifier(value)
    except PublicError:
        raise PublicError("image_reference_forbidden", 403) from None


async def _attachment_file(owner: str, session_id: str, attachment_id: str):
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
    target = attachment_path(attachment_id)
    return target, mime, _image_size(target, "attachment_not_found")


async def _artifact_file(owner: str, session_id: str, artifact_id: str):
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
    target = artifact_path(artifact_id)
    return target, _image_size(target, "chart_image_missing")


def _encode_file(target, mime: str, code: str) -> str:
    raw = _read_image(target, code)
    return "data:" + mime + ";base64," + base64.b64encode(raw).decode()


def _image_size(target, code: str) -> int:
    if not target.is_file():
        raise PublicError(code, 404)
    size = target.stat().st_size
    if size <= 0 or size > IMAGE_BYTE_LIMIT:
        raise PublicError("checkpoint_too_large", 409)
    return size


def _read_image(target, code: str) -> bytes:
    _image_size(target, code)
    return target.read_bytes()
