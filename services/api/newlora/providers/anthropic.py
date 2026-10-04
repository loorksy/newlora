import time
from typing import Any

from anthropic import AsyncAnthropic

from .base import Delta, PublicTextStream, Reply, ToolCall, public_text


class AnthropicProvider:
    def __init__(self, key: str, client=None):
        self.client: Any = client or AsyncAnthropic(api_key=key, max_retries=0, timeout=90)

    async def close(self):
        await self.client.close()

    async def models(self):
        return [m.model_dump(mode="json") async for m in self.client.models.list()]

    async def complete(
        self,
        model: str,
        messages: list[dict],
        tools: list[dict],
        *,
        on_delta: Delta | None = None,
        native: dict | None = None,
    ) -> Reply:
        system = "\n".join(m["content"] for m in messages if m["role"] == "system")
        inputs: list[dict[str, Any]] = []
        for m in messages:
            if m["role"] == "system":
                continue
            if m["role"] == "tool":
                role = "user"
                blocks = [
                    {"type": "tool_result", "tool_use_id": m["call_id"], "content": m["content"]}
                ]
            else:
                role = m["role"]
                blocks = [{"type": "text", "text": m.get("content") or " "}]
                for url in m.get("images", []):
                    mime, data = url.split(";base64,", 1)
                    blocks.append(
                        {
                            "type": "image",
                            "source": {"type": "base64", "media_type": mime[5:], "data": data},
                        }
                    )
                blocks += [
                    {"type": "tool_use", "id": c["id"], "name": c["name"], "input": c["arguments"]}
                    for c in m.get("calls", [])
                ]
            if inputs and inputs[-1]["role"] == role:
                inputs[-1]["content"].extend(blocks)
            else:
                inputs.append({"role": role, "content": blocks})
        start = time.monotonic()
        first = None
        sanitizer = PublicTextStream()
        async with self.client.messages.stream(
            model=model,
            system=system,
            messages=inputs,
            max_tokens=8192,
            tools=[
                {
                    "name": t["name"],
                    "description": t["description"],
                    "input_schema": t["parameters"],
                }
                for t in tools
            ],
            **(native or {}),
        ) as stream:
            async for event in stream:
                if (
                    event.type == "content_block_delta"
                    and event.delta.type == "text_delta"
                    and first is None
                ):
                    first = (time.monotonic() - start) * 1000
                if event.type == "content_block_delta" and event.delta.type == "text_delta":
                    safe_delta = sanitizer.feed(event.delta.text)
                    if on_delta and safe_delta:
                        await on_delta(safe_delta)
            result = await stream.get_final_message()
        text = public_text("".join(x.text for x in result.content if x.type == "text"))
        calls = [ToolCall(x.id, x.name, x.input) for x in result.content if x.type == "tool_use"]
        u = result.usage
        cached, write = (
            getattr(u, "cache_read_input_tokens", 0) or 0,
            getattr(u, "cache_creation_input_tokens", 0) or 0,
        )
        return Reply(
            text,
            calls,
            u.input_tokens + cached + write,
            u.output_tokens,
            cached,
            write,
            u.input_tokens + cached + write + u.output_tokens,
            getattr(result, "_request_id", None),
            first,
        )
