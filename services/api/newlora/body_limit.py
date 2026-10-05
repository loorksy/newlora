"""Bound bytes received even when Content-Length is absent or dishonest."""

from starlette.responses import JSONResponse


class BodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        maximum = 8_100_000 if scope["path"].endswith("/attachments") else 2_000_000
        total, chunks = 0, []
        while True:
            event = await receive()
            if event["type"] == "http.disconnect":
                return
            total += len(event.get("body", b""))
            if total > maximum:
                return await JSONResponse({"code": "request_too_large"}, 413)(scope, receive, send)
            chunks.append(event)
            if not event.get("more_body"):
                break

        async def bounded_receive():
            return chunks.pop(0) if chunks else await receive()

        await self.app(scope, bounded_receive, send)
