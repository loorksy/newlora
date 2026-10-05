#!/usr/bin/env python3
"""Serve signed Newlora OTA files from a fixed root. No directory listing."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import re

ROOT = Path(os.environ.get("OTA_ROOT", "/opt/newlora/updates")).resolve()
HOST = os.environ.get("OTA_BIND", "127.0.0.1")
PORT = int(os.environ.get("OTA_PORT", "18082"))
ALLOWED = re.compile(
    r"^/app-updates/android/(preview|stable|harness|harness-bad)/"
    r"(manifest|releases/[A-Za-z0-9._-]{8,80}/(?:bundle|manifest\.json)|health)$"
)
HEALTH = "/app-updates/health"


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        self._serve(True)

    def do_HEAD(self):
        self._serve(False)

    def _serve(self, send_body: bool) -> None:
        path = self.path.split("?", 1)[0]
        if path == HEALTH:
            self._write(200, b"ok\n", "text/plain; charset=utf-8", send_body, cache=False)
            return
        if not ALLOWED.match(path) or ".." in path:
            self._write(404, b"not found\n", "text/plain; charset=utf-8", send_body, cache=False)
            return
        rel = path[len("/app-updates/") :]
        target = (ROOT / rel).resolve()
        if ROOT != target and ROOT not in target.parents:
            self._write(404, b"not found\n", "text/plain; charset=utf-8", send_body, cache=False)
            return
        if not target.is_file():
            self._write(404, b"not found\n", "text/plain; charset=utf-8", send_body, cache=False)
            return
        data = target.read_bytes()
        kind = "application/json" if target.name in {"manifest", "manifest.json"} else "application/octet-stream"
        cache = "/releases/" in path
        self._write(200, data, kind, send_body, cache)

    def _write(self, status: int, body: bytes, content_type: str, send_body: bool, cache: bool) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "public, max-age=31536000, immutable" if cache else "no-store")
        self.end_headers()
        if send_body:
            self.wfile.write(body)

    def log_message(self, fmt, *args):
        return


def main() -> None:
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
