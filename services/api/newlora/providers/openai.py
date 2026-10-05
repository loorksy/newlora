import json
import time

from openai import AsyncOpenAI

from .base import Delta, PublicTextStream, Reply, ToolCall, public_text


class OpenAIProvider:
    def __init__(self, key: str, client=None):
        self.client = client or AsyncOpenAI(api_key=key, max_retries=0, timeout=90)

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
        inputs = []
        for m in messages:
            if m["role"] == "tool":
                inputs.append(
                    {
                        "type": "function_call_output",
                        "call_id": m["call_id"],
                        "output": m["content"],
                    }
                )
            else:
                content = [
                    {
                        "type": "output_text" if m["role"] == "assistant" else "input_text",
                        "text": m.get("content") or " ",
                    }
                ]
                content += [
                    {"type": "input_image", "image_url": url, "detail": "high"}
                    for url in m.get("images", [])
                ]
                inputs.append({"role": m["role"], "content": content})
                for call in m.get("calls", []):
                    inputs.append(
                        {
                            "type": "function_call",
                            "call_id": call["id"],
                            "name": call["name"],
                            "arguments": json.dumps(call["arguments"]),
                        }
                    )
        kwargs = {
            "model": model,
            "input": inputs,
            "store": False,
            "tools": [{"type": "function", **t, "strict": False} for t in tools],
            **(native or {}),
        }
        start = time.monotonic()
        first = None
        # Native stream is consumed, but only public output text is ever forwarded.
        stream = await self.client.responses.create(**kwargs, stream=True)
        result = None
        buffer = ""
        sanitizer = PublicTextStream()
        async for event in stream:
            if event.type == "response.output_text.delta":
                if first is None:
                    first = (time.monotonic() - start) * 1000
                buffer += event.delta
                safe_delta = sanitizer.feed(event.delta)
                if on_delta and safe_delta:
                    await on_delta(safe_delta)
            elif event.type == "response.completed":
                result = event.response
            elif event.type in ("response.failed", "response.incomplete", "error"):
                raise RuntimeError("provider_response_failed")
        if result is None:
            raise RuntimeError("provider_stream_interrupted")
        text = public_text(buffer or result.output_text)
        calls = [
            ToolCall(x.call_id, x.name, json.loads(x.arguments))
            for x in result.output
            if x.type == "function_call"
        ]
        u = result.usage
        return Reply(
            text,
            calls,
            u.input_tokens if u else None,
            u.output_tokens if u else None,
            getattr(getattr(u, "input_tokens_details", None), "cached_tokens", None),
            None,
            u.total_tokens if u else None,
            getattr(result, "_request_id", None),
            first,
        )
