"""Verified immutable snapshots; absence of any needed rate yields unknown, not zero."""

import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


class PriceVersion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str
    effective_at: AwareDatetime
    provider: Literal["openai", "anthropic", "zai"]
    model: str
    modality: Literal["text", "audio"]
    currency: Literal["USD"] = "USD"
    source: str
    input: Decimal | None = Field(default=None, ge=0)
    output: Decimal | None = Field(default=None, ge=0)
    cached_input: Decimal | None = Field(default=None, ge=0)
    cache_write: Decimal | None = Field(default=None, ge=0)
    audio_per_second: Decimal | None = Field(default=None, ge=0)
    tier: str = "standard"
    min_context: int = 0
    max_context: int | None = None


def apply_price(
    usage, rates: list[PriceVersion] | None = None, *, modality="text", tier="standard"
):
    if usage.pricing_version:
        return  # Historical usage is never repriced on catalog refresh.
    if rates is None:
        rates = [
            PriceVersion.model_validate(r)
            for r in json.loads(Path("packages/shared/pricing.json").read_text())["rates"]
        ]
    at = usage.created_at or datetime.now(UTC)
    if at.tzinfo is None:
        at = at.replace(tzinfo=UTC)
    choices = [
        r
        for r in rates
        if r.provider == usage.provider
        and r.model == usage.model
        and r.modality == modality
        and r.tier == tier
        and r.effective_at <= at
        and r.min_context <= (usage.input_tokens or 0)
        and (r.max_context is None or (usage.input_tokens or 0) <= r.max_context)
    ]
    if not choices:
        return
    rate = max(choices, key=lambda r: r.effective_at)
    hosts = {
        "openai": {"openai.com", "developers.openai.com", "platform.openai.com"},
        "anthropic": {
            "anthropic.com",
            "www.anthropic.com",
            "platform.claude.com",
            "docs.claude.com",
        },
        "zai": {"docs.z.ai", "open.bigmodel.cn"},
    }
    source = urlsplit(rate.source)
    if source.scheme != "https" or source.hostname not in hosts[rate.provider]:
        return
    if modality == "audio":
        if usage.audio_seconds is None or rate.audio_per_second is None:
            return
        cost = Decimal(str(usage.audio_seconds)) * rate.audio_per_second
    else:
        if (
            usage.input_tokens is None
            or usage.output_tokens is None
            or rate.input is None
            or rate.output is None
        ):
            return
        cached, write = usage.cached_input_tokens or 0, usage.cache_write_tokens or 0
        if cached and rate.cached_input is None or write and rate.cache_write is None:
            return
        # Provider adapters must normalize input as inclusive of cache read/write tokens.
        fresh = usage.input_tokens - cached - write
        if fresh < 0:
            return
        cost = (
            fresh * rate.input
            + usage.output_tokens * rate.output
            + cached * (rate.cached_input or 0)
            + write * (rate.cache_write or 0)
        ) / 1_000_000
    usage.cost, usage.pricing_version = float(cost), rate.version
    usage.pricing_snapshot = rate.model_dump(mode="json")
