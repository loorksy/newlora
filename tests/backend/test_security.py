from unittest.mock import patch

import pytest
from fastapi import HTTPException
from newlora.contracts import ActivityEvent, TaskConfig
from newlora.db import DeviceSession, sessions
from newlora.providers.base import public_text
from newlora.security import (
    PublicError,
    authenticate,
    decrypt,
    encrypt,
    issue_tokens,
    public_ip,
    resolve_public,
)
from sqlalchemy import select


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",
        "10.0.0.1",
        "169.254.169.254",
        "::1",
        "::ffff:127.0.0.1",
        "100.64.0.1",
        "224.0.0.1",
        "192.168.1.4",
        "0.0.0.0",
    ],
)
def test_blocks_non_public_ip(ip):
    assert not public_ip(ip)


def test_pins_validated_dns():
    with patch("socket.getaddrinfo", return_value=[(2, 1, 6, "", ("93.184.216.34", 443))]):
        assert resolve_public("https://example.com")[2] == ["93.184.216.34"]
    with patch("socket.getaddrinfo", return_value=[(2, 1, 6, "", ("127.0.0.1", 443))]):
        with pytest.raises(PublicError):
            resolve_public("https://example.com")


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "http://user:pass@example.com",
        "http://example.com:8000",
        "ftp://example.com",
    ],
)
def test_unsafe_urls(url):
    with pytest.raises(PublicError):
        resolve_public(url)


def test_encryption_and_no_thoughts():
    encrypted = encrypt({"key": "secret-oanda"})
    assert "secret-oanda" not in encrypted
    assert decrypt(encrypted) == {"key": "secret-oanda"}
    assert public_text("<think>private</think>Public") == "Public"
    assert public_text("Public<analysis>private") == "Public"
    with pytest.raises(ValueError):
        ActivityEvent(type="thinking_deeply")


async def test_revoked_device_rejected():
    pair = await issue_tokens()
    assert await authenticate(pair["accessToken"]) == "owner"
    async with sessions() as db:
        row = await db.scalar(select(DeviceSession))
        row.revoked = True
        await db.commit()
    with pytest.raises(HTTPException):
        await authenticate(pair["accessToken"])


def test_task_requires_concrete_schedule():
    with pytest.raises(ValueError):
        TaskConfig(objective="watch", schedule="interval")
    with pytest.raises(ValueError):
        TaskConfig(objective="watch", schedule="once")
    assert (
        TaskConfig(objective="watch", schedule="interval", interval_seconds=1800).notification
        == "normal"
    )


def test_private_tags_do_not_leak_across_stream_chunks():
    from newlora.providers.base import PublicTextStream

    stream = PublicTextStream()
    chunks = ["Hello ", "<thi", "nk>secret ", "private", "</thi", "nk> world"]
    assert "".join(stream.feed(c) for c in chunks) == "Hello  world"
