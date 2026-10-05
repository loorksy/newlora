"""Validate reviewed official metadata before publishing a server catalog update.

Usage: uv run python scripts/verify_models.py [--check-sources]
No discovery guesses or automatic promotion; editors must review official capability pages.
"""

import argparse
import asyncio

import httpx
from newlora.catalog import manifest


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-sources", action="store_true")
    args = parser.parse_args()
    data = manifest()
    if args.check_sources:
        async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
            for url in sorted({m["source"] for m in data["models"]}):
                response = await client.get(url)
                response.raise_for_status()
    print(f"Validated {len(data['models'])} reviewed entries, verified {data['verified_at']}")


asyncio.run(main())
