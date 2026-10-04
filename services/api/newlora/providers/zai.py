import asyncio
import json
import time

from zai import ZaiClient

from .base import Delta, PublicTextStream, Reply, ToolCall, public_text


class ZAIProvider:
    def __init__(self, key: str, client=None):
        self.client = client or ZaiClient(api_key=key, max_retries=0, timeout=90)

    async def close(self):
        await asyncio.to_thread(self.client.close)

    async def models(self):
        # Official SDK 0.2.3 exposes no models resource. Catalog uses official manifest.
        return []

    async def complete(
        self,
        model: str,
        messages: list[dict],
        tools: list[dict],
        *,
        on_delta: Delta | None = None,
        native: dict | None = None,
    ) -> Reply:
        inputs = []
        for m in messages:
            value = {"role": m["role"], "content": m.get("content") or " "}
            if m["role"] == "tool":
                value["tool_call_id"] = m["call_id"]
            if m.get("images"):
                value["content"] = [
                    {"type": "text", "text": m["content"]},
                    *[{"type": "image_url", "image_url": {"url": url}} for url in m["images"]],
                ]
            if m.get("calls"):
                value["tool_calls"] = [
                    {
                        "id": c["id"],
                        "type": "function",
                        "function": {"name": c["name"], "arguments": json.dumps(c["arguments"])},
                    }
                    for c in m["calls"]
                ]
            inputs.append(value)

        loop = asyncio.get_running_loop()

        async def forward(value):
            if on_delta:
                await on_delta(value)

        def request():
            sanitizer = PublicTextStream()
            start = time.monotonic()
            first, usage, request_id = None, None, None
            text = ""
            calls: dict[int, dict[str, str]] = {}
            stream = self.client.chat.completions.create(
                model=model,
                messages=inputs,
                tools=[{"type": "function", "function": t} for t in tools] or None,
                stream=True,
                **(native or {}),
            )
            for chunk in stream:
                request_id = getattr(chunk, "id", request_id)
                usage = getattr(chunk, "usage", None) or usage
                for choice in chunk.choices:
                    delta = choice.delta
                    if delta.content:
                        first = first if first is not None else (time.monotonic() - start) * 1000
                        text += delta.content
                        safe_delta = sanitizer.feed(delta.content)
                        if on_delta and safe_delta:
                            asyncio.run_coroutine_threadsafe(forward(safe_delta), loop).result(
                                timeout=15
                            )
                    # Deliberately never access reasoning_content.
                    for call in delta.tool_calls or []:
                        entry = calls.setdefault(
                            call.index, {"id": "", "name": "", "arguments": ""}
                        )
                        if call.id:
                            entry["id"] = call.id
                        if call.function:
                            entry["name"] += call.function.name or ""
                            entry["arguments"] += call.function.arguments or ""
            return Reply(
                public_text(text),
                [ToolCall(c["id"], c["name"], json.loads(c["arguments"])) for c in calls.values()],
                getattr(usage, "prompt_tokens", None),
                getattr(usage, "completion_tokens", None),
                getattr(getattr(usage, "prompt_tokens_details", None), "cached_tokens", None),
                None,
                getattr(usage, "total_tokens", None),
                request_id,
                first,
            )

        reply = await asyncio.to_thread(request)
        return reply
