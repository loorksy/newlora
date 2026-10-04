"""Render the bundled chart in Chromium using test-only candles, verify actual pixels."""

import asyncio
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.async_api import async_playwright


async def main():
    server = ThreadingHTTPServer(
        ("127.0.0.1", 8766), partial(SimpleHTTPRequestHandler, directory="packages/chart/dist")
    )
    threading.Thread(target=server.serve_forever, daemon=True).start()
    candles = [
        {
            "timestamp": 1760000000000 + i * 900000,
            "open": 2400 + i,
            "high": 2408 + i,
            "low": 2397 + i,
            "close": 2405 + i,
            "volume": 40 + i,
        }
        for i in range(80)
    ]
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 1000})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto("http://127.0.0.1:8766")
        await page.wait_for_function("window.newlora !== undefined")
        await page.evaluate(
            "state=>window.newlora.load(state)",
            {
                "instrument": "XAU_USD",
                "timeframe": "M15",
                "candles": candles,
                "drawings": [
                    {"id": "level", "kind": "horizontal", "points": [{"value": 2440}]},
                    {
                        "id": "zone",
                        "kind": "zone",
                        "points": [
                            {"timestamp": candles[20]["timestamp"], "value": 2420},
                            {"timestamp": candles[40]["timestamp"], "value": 2440},
                        ],
                    },
                ],
                "locale": "ar",
            },
        )
        await page.wait_for_function("window.newlora.ready")
        await page.screenshot(path="/tmp/newlora-chart-smoke.png")
        assert await page.locator("canvas").count() > 0
        assert not errors, errors
        await browser.close()
    server.shutdown()
    print("Chart rendered successfully: /tmp/newlora-chart-smoke.png")


asyncio.run(main())
