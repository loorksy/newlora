import asyncio

from sqlalchemy import select

from .config import settings
from .db import Record, sessions
from .security import PublicError

_app = None


async def send_push(owner: str, payload: dict):
    global _app
    if not settings().fcm_credentials:
        raise PublicError("push_not_configured", 409)
    import firebase_admin
    from firebase_admin import credentials, messaging

    if _app is None:
        _app = firebase_admin.initialize_app(credentials.Certificate(settings().fcm_credentials))
    async with sessions() as db:
        devices = (
            await db.scalars(
                select(Record).where(Record.owner == owner, Record.kind == "push_device")
            )
        ).all()
    if not devices:
        raise PublicError("push_device_not_registered", 409)
    # Privacy: no market thesis on the lock screen. Device resolves details after authentication.
    data = {k: str(v) for k, v in payload.items() if v is not None and k != "summary"}
    for device in devices:
        message = messaging.Message(
            token=device.data["token"],
            data=data,
            android=messaging.AndroidConfig(
                priority="high" if payload["mode"] in ("urgent", "call") else "normal",
                ttl=120 if payload["mode"] == "call" else 3600,
            ),
        )
        await asyncio.to_thread(messaging.send, message, app=_app)
