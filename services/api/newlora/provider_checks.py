"""Connection probes call official adapters only; no permanent probe model ID."""

import time

from .catalog import select_models
from .db import Usage, sessions
from .providers import provider
from .security import credential


async def test_zai(owner: str) -> str:
    c = await credential(owner, "zai")
    adapter = provider("zai", c["key"])
    try:
        choices = select_models("zai", [])
        if not choices:
            return "model_unavailable"
        # A bounded fallback across verified production models, never an invented ID.
        for choice in choices[:3]:
            started = time.monotonic()
            async with sessions() as db:
                attempt = Usage(
                    owner=owner,
                    provider="zai",
                    model=choice["id"],
                    agent_type="connection_test",
                    latency_ms=0,
                    success=False,
                )
                db.add(attempt)
                await db.commit()
            reply = None
            status = "connected"
            try:
                reply = await adapter.complete(
                    choice["id"],
                    [{"role": "user", "content": "Reply OK."}],
                    [],
                    native={"max_tokens": 32},
                )
            except Exception as exc:
                code = getattr(exc, "status_code", None)
                status = (
                    "invalid_credential"
                    if code == 401
                    else "model_unavailable"
                    if code in (403, 404)
                    else "provider_unavailable"
                )
            finally:
                async with sessions() as db:
                    row = await db.get(Usage, attempt.id)
                    row.latency_ms, row.success = (
                        (time.monotonic() - started) * 1000,
                        reply is not None,
                    )
                    if reply:
                        row.input_tokens, row.output_tokens, row.total_tokens = (
                            reply.input_tokens,
                            reply.output_tokens,
                            reply.total_tokens,
                        )
                    await db.commit()
            if status != "model_unavailable":
                return status
        return "model_unavailable"
    finally:
        await adapter.close()
