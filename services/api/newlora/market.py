from datetime import datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

import httpx
from pydantic import Field

from .contracts import Contract
from .db import now
from .security import PublicError, credential

TIMEFRAMES = {
    "S5",
    "S10",
    "S15",
    "S30",
    "M1",
    "M2",
    "M4",
    "M5",
    "M10",
    "M15",
    "M30",
    "H1",
    "H2",
    "H3",
    "H4",
    "H6",
    "H8",
    "H12",
    "D",
    "W",
    "M",
}


class MarketRequest(Contract):
    instrument: str = Field(pattern=r"^[A-Z0-9_]{3,24}$")
    timeframe: str = "H1"
    count: int = Field(default=300, ge=2, le=5000)
    from_time: datetime | None = None
    to_time: datetime | None = None


def normalize_candles(raw: dict, instrument: str, timeframe: str) -> dict:
    candles = []
    for c in raw.get("candles", []):
        prices = c.get("mid") or c.get("bid") or c.get("ask")
        if not prices:
            continue
        candles.append(
            {
                "timestamp": int(
                    datetime.fromisoformat(c["time"].replace("Z", "+00:00")).timestamp() * 1000
                ),
                "open": float(prices["o"]),
                "high": float(prices["h"]),
                "low": float(prices["l"]),
                "close": float(prices["c"]),
                "volume": c["volume"],
                "complete": c["complete"],
            }
        )
    return {
        "instrument": instrument,
        "timeframe": timeframe,
        "candles": candles,
        "retrievedAt": now().isoformat(),
        "freshness": "historical",
        "cacheTtlSeconds": 0,
        "lastCandleAt": raw.get("candles", [{}])[-1].get("time") if raw.get("candles") else None,
    }


class Oanda:
    def __init__(
        self,
        key: str,
        account: str,
        environment: Literal["practice", "live"] = "practice",
        client=None,
    ):
        self.account = account
        self.client = client or httpx.AsyncClient(
            base_url="https://api-fxtrade.oanda.com/v3"
            if environment == "live"
            else "https://api-fxpractice.oanda.com/v3",
            headers={"Authorization": f"Bearer {key}"},
            timeout=25,
        )

    @classmethod
    async def for_owner(cls, owner):
        c = await credential(owner, "oanda")
        return cls(c["key"], c["account"], c.get("environment", "practice"))

    async def close(self):
        await self.client.aclose()

    async def get(self, path, params=None):
        result = await self.client.get(path, params=params)
        if result.status_code >= 400:
            raise PublicError("oanda_connection_failed", 502)
        return result.json()

    async def instruments(self):
        raw = await self.get(f"/accounts/{self.account}/instruments")
        # OANDA classifies precious metals as METAL on some feeds and CFD on others;
        # currency-code identification avoids admitting indices/crypto/energy CFDs.
        return [
            x
            for x in raw["instruments"]
            if x.get("type") == "CURRENCY"
            or x["name"].split("_")[0] in {"XAU", "XAG", "XPT", "XPD"}
        ]

    async def require(self, instrument):
        if not any(x["name"] == instrument for x in await self.instruments()):
            raise PublicError("instrument_unsupported")

    async def pricing(self, instrument):
        await self.require(instrument)
        raw = await self.get(f"/accounts/{self.account}/pricing", {"instruments": instrument})
        p = raw["prices"][0]
        return {
            "instrument": instrument,
            "bids": p.get("bids", []),
            "asks": p.get("asks", []),
            "tradeable": p.get("tradeable", False),
            "status": p.get("status"),
            "asOf": p["time"],
            "retrievedAt": now().isoformat(),
            "freshness": "live-ish"
            if (now() - datetime.fromisoformat(p["time"].replace("Z", "+00:00"))).total_seconds()
            <= 30
            else "delayed",
            "cacheTtlSeconds": 0,
        }

    async def candles(self, args: MarketRequest):
        await self.require(args.instrument)
        if args.timeframe not in TIMEFRAMES:
            raise PublicError("timeframe_unsupported")
        params = {"granularity": args.timeframe, "price": "M"}
        if args.from_time:
            params["from"] = args.from_time.isoformat()
        if args.to_time:
            params["to"] = args.to_time.isoformat()
        if not (args.from_time and args.to_time):
            params["count"] = str(args.count)
        raw = await self.get(f"/instruments/{args.instrument}/candles", params)
        return normalize_candles(raw, args.instrument, args.timeframe)


def forex_sessions(at: datetime | None = None) -> dict:
    at = at or now()
    venues = [
        ("Sydney", "Australia/Sydney", 8, 17),
        ("Tokyo", "Asia/Tokyo", 9, 18),
        ("London", "Europe/London", 8, 17),
        ("New York", "America/New_York", 8, 17),
    ]
    active, transitions = [], []
    for name, zone, opening, closing in venues:
        local = at.astimezone(ZoneInfo(zone))
        if local.weekday() < 5 and opening <= local.hour < closing:
            active.append(name)
        for day in range(8):
            date = local.date() + timedelta(days=day)
            if date.weekday() >= 5:
                continue
            for hour, action in [(opening, "opens"), (closing, "closes")]:
                candidate = datetime.combine(date, time(hour), ZoneInfo(zone))
                if candidate > at:
                    transitions.append(
                        {"session": name, "action": action, "at": candidate.isoformat()}
                    )
    transitions.sort(key=lambda x: datetime.fromisoformat(x["at"]).timestamp())
    return {
        "asOf": at.isoformat(),
        "active": active,
        "overlap": len(active) > 1,
        "nextTransition": transitions[0],
        "basis": "conventional_local_business_hours",
        "tradeabilitySource": "OANDA pricing; holidays and instrument closures are not inferred from session hours",
    }
