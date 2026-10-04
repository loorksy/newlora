import hashlib
import ipaddress
import json
import secrets
import socket
from datetime import timedelta
from urllib.parse import urlsplit

import jwt
from argon2 import PasswordHasher
from cryptography.fernet import Fernet
from fastapi import HTTPException
from sqlalchemy import select

from .config import settings
from .db import Credential, DeviceSession, now, sessions


class PublicError(Exception):
    def __init__(self, code: str, status: int = 400):
        self.code, self.status = code, status
        super().__init__(code)


def encrypt(data: dict) -> str:
    return (
        Fernet(settings().master_key.get_secret_value().encode())
        .encrypt(json.dumps(data).encode())
        .decode()
    )


def decrypt(value: str) -> dict:
    return json.loads(
        Fernet(settings().master_key.get_secret_value().encode()).decrypt(value.encode())
    )


async def credential(owner: str, provider: str) -> dict:
    async with sessions() as db:
        row = await db.scalar(
            select(Credential).where(Credential.owner == owner, Credential.provider == provider)
        )
        if row is None:
            raise PublicError(f"{provider}_not_configured", 409)
        return decrypt(row.ciphertext)


def password_ok(password: str) -> bool:
    try:
        return PasswordHasher().verify(settings().owner_password_hash.get_secret_value(), password)
    except Exception:
        return False


async def issue_tokens(owner: str = "owner") -> dict:
    refresh = secrets.token_urlsafe(48)
    async with sessions() as db:
        row = DeviceSession(
            owner=owner,
            refresh_hash=hashlib.sha256(refresh.encode()).hexdigest(),
            expires_at=now() + timedelta(days=30),
        )
        db.add(row)
        await db.commit()
        return token_pair(row, refresh)


def token_pair(row: DeviceSession, refresh: str) -> dict:
    access = jwt.encode(
        {
            "sub": row.owner,
            "sid": row.id,
            "aud": "newlora",
            "iss": "newlora",
            "iat": now(),
            "exp": now() + timedelta(minutes=15),
        },
        settings().jwt_secret.get_secret_value(),
        algorithm="HS256",
    )
    return {"accessToken": access, "refreshToken": refresh, "expiresIn": 900}


async def authenticate(token: str) -> str:
    try:
        claims = jwt.decode(
            token,
            settings().jwt_secret.get_secret_value(),
            algorithms=["HS256"],
            audience="newlora",
            issuer="newlora",
            options={"require": ["exp", "iat", "sub", "sid"]},
        )
        async with sessions() as db:
            row = await db.get(DeviceSession, claims["sid"])
            if (
                not row
                or row.revoked
                or row.owner != claims["sub"]
                or row.expires_at.timestamp() <= now().timestamp()
            ):
                raise ValueError("revoked")
        return str(claims["sub"])
    except Exception:
        raise HTTPException(401, "authentication_required") from None


def public_ip(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value)
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        return ip.is_global and not ip.is_multicast
    except ValueError:
        return False


def resolve_public(url: str) -> tuple[str, int, list[str]]:
    """Validate every address; callers must connect to returned IPs, never re-resolve."""
    parsed = urlsplit(url)
    if (
        parsed.scheme not in ("https", "http")
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise PublicError("unsafe_url")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    if port not in (80, 443):
        raise PublicError("unsafe_url")
    addresses = sorted(
        {str(r[4][0]) for r in socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)}
    )
    if not addresses or not all(public_ip(ip) for ip in addresses):
        raise PublicError("unsafe_url")
    return parsed.hostname, port, addresses
