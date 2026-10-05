"""Public-only forward proxy. DNS is validated then the connection uses the exact IP."""

import asyncio
from urllib.parse import urlsplit

from newlora.security import resolve_public


async def pipe(reader, writer):
    try:
        while data := await asyncio.wait_for(reader.read(65536), timeout=60):
            writer.write(data)
            await writer.drain()
    finally:
        writer.close()


async def handle(reader, writer):
    try:
        head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=10)
        if len(head) > 16384:
            raise ValueError("headers")
        first, *headers = head.decode("latin1").split("\r\n")
        method, target, version = first.split(" ", 2)
        url = f"https://{target}" if method == "CONNECT" else target
        host, port, ips = await asyncio.to_thread(resolve_public, url)
        remote_reader, remote_writer = await asyncio.wait_for(
            asyncio.open_connection(ips[0], port), timeout=10
        )
        if method == "CONNECT":
            writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            await writer.drain()
        else:
            parsed = urlsplit(url)
            path = (parsed.path or "/") + ("?" + parsed.query if parsed.query else "")
            safe_headers = [
                h
                for h in headers
                if h and not h.lower().startswith(("host:", "proxy-", "connection:"))
            ]
            remote_writer.write(
                (
                    f"{method} {path} {version}\r\nHost: {host}\r\nConnection: close\r\n"
                    + "\r\n".join(safe_headers)
                    + "\r\n\r\n"
                ).encode("latin1")
            )
            await remote_writer.drain()
        await asyncio.gather(pipe(reader, remote_writer), pipe(remote_reader, writer))
    except Exception:
        if not writer.is_closing():
            writer.write(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
            await writer.drain()
            writer.close()


async def main():
    server = await asyncio.start_server(handle, "0.0.0.0", 8091, limit=16384)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
