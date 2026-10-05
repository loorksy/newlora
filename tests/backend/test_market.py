from datetime import UTC, datetime

import httpx
import pytest
from newlora.market import Oanda, forex_sessions, normalize_candles
from newlora.security import PublicError


def test_candles_preserve_timestamps_and_incomplete():
    raw = {
        "candles": [
            {
                "time": "2026-10-02T12:00:00.000000000Z",
                "volume": 15,
                "complete": False,
                "mid": {"o": "1.1", "h": "1.2", "l": "1.0", "c": "1.15"},
            }
        ]
    }
    result = normalize_candles(raw, "EUR_USD", "M5")
    assert result["candles"][0]["close"] == 1.15
    assert result["candles"][0]["complete"] is False
    assert result["freshness"] == "historical"
    assert result["retrievedAt"]


def test_dst_sessions_and_weekend():
    winter = forex_sessions(datetime(2026, 1, 12, 12, tzinfo=UTC))
    summer = forex_sessions(datetime(2026, 7, 13, 12, tzinfo=UTC))
    assert "New York" not in winter["active"]
    assert "New York" in summer["active"]
    assert forex_sessions(datetime(2026, 10, 4, 12, tzinfo=UTC))["active"] == []


async def test_account_supported_instruments_only():
    def respond(req):
        return httpx.Response(
            200,
            json={
                "instruments": [
                    {"name": "EUR_USD", "type": "CURRENCY"},
                    {"name": "XAU_USD", "type": "CFD"},
                    {"name": "US30_USD", "type": "CFD"},
                ]
            },
        )

    client = httpx.AsyncClient(
        base_url="https://api-fxpractice.oanda.com/v3", transport=httpx.MockTransport(respond)
    )
    market = Oanda("secret", "account", client=client)
    assert [v["name"] for v in await market.instruments()] == ["EUR_USD", "XAU_USD"]
    with pytest.raises(PublicError):
        await market.require("BTC_USD")
    await market.close()


@pytest.mark.parametrize(
    "instrument,precision,pip",
    [
        ("XAU_USD", 3, -2),
        ("USD_JPY", 3, -2),
        ("EUR_USD", 5, -4),
        ("XAG_USD", 5, -4),
        ("XPT_USD", 2, -1),
    ],
)
async def test_candles_carry_account_precision_metadata(instrument, precision, pip):
    from newlora.market import MarketRequest

    def response(req):
        if req.url.path.endswith("/instruments"):
            return httpx.Response(
                200,
                json={
                    "instruments": [
                        {
                            "name": instrument,
                            "type": "CURRENCY",
                            "displayPrecision": precision,
                            "pipLocation": pip,
                        }
                    ]
                },
            )
        return httpx.Response(200, json={"candles": []})

    market = Oanda(
        "key",
        "account",
        client=httpx.AsyncClient(
            base_url="https://api-fxpractice.oanda.com/v3", transport=httpx.MockTransport(response)
        ),
    )
    result = await market.candles(MarketRequest(instrument=instrument))
    assert result["metadata"] == {
        "pricePrecision": precision,
        "pipLocation": pip,
        "volumePrecision": 0,
        "volumeUnit": "price_updates",
    }
    await market.close()
