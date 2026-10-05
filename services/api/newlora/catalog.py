import json
from datetime import date, timedelta
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from .config import settings
from .db import Record, now, sessions
from .providers import provider
from .security import PublicError, credential


class VerifiedModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    provider: Literal["openai", "anthropic", "zai"]
    id: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9._:-]+$")
    rank: int = Field(ge=0)
    production: bool
    deprecated: bool
    tools: bool
    vision: bool
    voice: bool
    source: str


def manifest() -> dict:
    try:
        value = json.loads(settings().catalog_manifest.read_text())
        verified = date.fromisoformat(value["verified_at"])
        if not 0 <= (now().date() - verified).days <= 120:
            raise ValueError("stale_manifest")
        seen = set()
        hosts = {
            "openai": {"developers.openai.com", "platform.openai.com"},
            "anthropic": {"docs.anthropic.com", "platform.claude.com", "docs.claude.com"},
            "zai": {"docs.z.ai", "open.bigmodel.cn"},
        }
        for raw in value["models"]:
            model = VerifiedModel.model_validate(raw)
            source = urlsplit(model.source)
            official_sdk_source = (
                model.provider == "anthropic"
                and source.hostname == "github.com"
                and source.path.startswith("/anthropics/anthropic-sdk-python/")
            )
            if source.scheme != "https" or (
                source.hostname not in hosts[model.provider] and not official_sdk_source
            ):
                raise ValueError("unverified_source")
            key = (model.provider, model.id)
            if key in seen:
                raise ValueError("duplicate_model")
            seen.add(key)
        return value
    except (ValueError, KeyError, TypeError, OSError):
        raise PublicError("catalog_verification_required", 409) from None


def select_models(name: str, available: list[dict], *, voice: bool = False) -> list[dict]:
    allowed = {
        m["id"]: m
        for m in manifest()["models"]
        if m["provider"] == name and m["production"] and not m["deprecated"] and m["voice"] == voice
    }
    if name == "zai":
        return sorted(allowed.values(), key=lambda m: m["rank"])[:7]
    result = []
    for item in available:
        if item["id"] in allowed:
            result.append(
                {
                    **allowed[item["id"]],
                    "created": item.get("created", item.get("created_at", "")),
                    "capabilities": item.get("capabilities"),
                }
            )
    return sorted(result, key=lambda m: str(m.get("created", "")), reverse=True)[:7]


async def catalog(owner: str, name: str, refresh: bool = False) -> dict:
    manifest()  # Cached account discovery never bypasses metadata freshness validation.
    async with sessions() as db:
        row = await db.scalar(
            select(Record).where(
                Record.owner == owner, Record.kind == "catalog", Record.session_id == name
            )
        )
        if (
            row
            and not refresh
            and row.updated_at.timestamp() > (now() - timedelta(hours=6)).timestamp()
        ):
            return row.data
    c = await credential(owner, name)
    adapter = provider(name, c["key"])
    try:
        available = await adapter.models()
    finally:
        await adapter.close()
    data = {
        "models": select_models(name, available),
        "voiceModels": select_models(name, available, voice=True),
        "refreshedAt": now().isoformat(),
        "verifiedAt": manifest()["verified_at"],
        "source": "official_sdk" if name != "zai" else "official_documentation",
        "targetCount": 7,
    }
    async with sessions() as db:
        if row:
            current = await db.get(Record, row.id)
            current.data, current.updated_at = data, now()
        else:
            db.add(Record(owner=owner, kind="catalog", session_id=name, data=data))
        await db.commit()
    return data


async def validate_selection(owner: str, selection, voice: bool = False):
    data = await catalog(owner, selection.provider)
    options = data["voiceModels" if voice else "models"]
    if not any(m["id"] == selection.model for m in options):
        raise PublicError("model_unavailable", 409)


def capability(name: str, model: str) -> dict:
    for row in manifest()["models"]:
        if row["provider"] == name and row["id"] == model:
            return row
    raise PublicError("model_unverified", 409)
