from datetime import UTC, datetime
from decimal import Decimal

from newlora.db import Usage, sessions
from newlora.pricing import PriceVersion, apply_price


def usage():
    return Usage(
        owner="owner",
        provider="openai",
        model="fixture-model",
        agent_type="main",
        latency_ms=1,
        success=True,
        input_tokens=1000000,
        output_tokens=100000,
        cached_input_tokens=200000,
        cache_write_tokens=100000,
        created_at=datetime(2026, 1, 10, tzinfo=UTC),
    )


def price(version="fixture-v1", effective="2026-01-01T00:00:00Z", **kwargs):
    return PriceVersion(
        version=version,
        effective_at=effective,
        provider="openai",
        model="fixture-model",
        modality="text",
        source="https://openai.com/api/pricing/",
        input=Decimal("2"),
        output=Decimal("4"),
        cached_input=Decimal("0.5"),
        cache_write=Decimal("3"),
        **kwargs,
    )


def test_unknown_pricing_remains_null():
    u = usage()
    apply_price(u, [])
    assert u.cost is None and u.pricing_version is None


async def test_verified_fixture_and_historical_snapshot_preservation():
    u = usage()
    apply_price(u, [price()])
    assert u.cost == 2.2 and u.pricing_version == "fixture-v1"
    async with sessions() as db:
        db.add(u)
        await db.commit()
    async with sessions() as db:
        stored = await db.get(Usage, u.id)
        apply_price(stored, [price("fixture-v2")])
        assert stored.cost == 2.2 and stored.pricing_version == "fixture-v1"
        assert stored.pricing_snapshot["source"] == "https://openai.com/api/pricing/"


def test_future_tier_context_and_missing_cache_rates_stay_unknown():
    for r in [
        price(effective="2027-01-01T00:00:00Z"),
        price(tier="batch"),
        price(min_context=2000000),
        price().model_copy(update={"cached_input": None}),
    ]:
        u = usage()
        apply_price(u, [r])
        assert u.cost is None
