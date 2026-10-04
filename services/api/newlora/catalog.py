import json
from datetime import timedelta

from sqlalchemy import select

from .config import settings
from .db import Record, now, sessions
from .providers import provider
from .security import PublicError, credential


def manifest() -> dict:
    return json.loads(settings().catalog_manifest.read_text())


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
