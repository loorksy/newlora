import json
from unittest.mock import AsyncMock

import pytest
from newlora.catalog import manifest
from newlora.db import Credential, Usage, sessions
from newlora.provider_checks import test_zai as probe_zai
from newlora.providers.base import Reply
from newlora.security import PublicError, encrypt
from sqlalchemy import select


@pytest.mark.parametrize("change", ["stale", "duplicate", "source", "malformed"])
def test_catalog_rejects_unverified_malformed_and_stale(tmp_path, monkeypatch, change):
    data = manifest()
    if change == "stale":
        data["verified_at"] = "2000-01-01"
    if change == "duplicate":
        data["models"].append(data["models"][0])
    if change == "source":
        data["models"][0]["source"] = "https://unverified.example/model"
    if change == "malformed":
        data["models"][0]["vision"] = "yes"
    target = tmp_path / "models.json"
    target.write_text(json.dumps(data))
    from newlora.config import settings

    monkeypatch.setattr(settings(), "catalog_manifest", target)
    with pytest.raises(PublicError, match="catalog_verification_required"):
        manifest()


@pytest.mark.parametrize(
    "codes,expected",
    [
        ([404, None], "connected"),
        ([401], "invalid_credential"),
        ([503], "provider_unavailable"),
        ([404, 403, 404], "model_unavailable"),
    ],
)
async def test_zai_probe_uses_manifest_fallback_and_distinct_failures(monkeypatch, codes, expected):
    class Failure(Exception):
        def __init__(self, status):
            self.status_code = status

    async with sessions() as db:
        db.add(
            Credential(
                owner="owner",
                provider="zai",
                ciphertext=encrypt({"key": "test-secret"}),
                last_four="cret",
            )
        )
        await db.commit()
    adapter = AsyncMock()
    adapter.complete.side_effect = [
        Failure(code) if code else Reply(text="OK", input_tokens=1, output_tokens=1, total_tokens=2)
        for code in codes
    ]
    monkeypatch.setattr("newlora.provider_checks.provider", lambda *args: adapter)
    assert await probe_zai("owner") == expected
    assert len({c.args[0] for c in adapter.complete.call_args_list}) == len(codes)
    async with sessions() as db:
        assert len((await db.scalars(select(Usage))).all()) == len(codes)
