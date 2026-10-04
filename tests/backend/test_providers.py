from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, MagicMock

from newlora.providers.anthropic import AnthropicProvider
from newlora.providers.openai import OpenAIProvider
from newlora.providers.zai import ZAIProvider


async def events(items):
    for item in items:
        yield item


async def test_openai_official_client_filters_reasoning_and_normalizes_tools():
    response = NS(
        output_text="Public",
        output=[
            NS(type="reasoning", summary="PRIVATE"),
            NS(
                type="function_call",
                call_id="call1",
                name="market_price",
                arguments='{"instrument":"XAU_USD"}',
            ),
        ],
        usage=NS(
            input_tokens=10,
            output_tokens=5,
            total_tokens=15,
            input_tokens_details=NS(cached_tokens=3),
        ),
        _request_id="request",
    )
    client = MagicMock()
    client.responses.create = AsyncMock(
        return_value=events(
            [
                NS(type="response.reasoning.delta", delta="PRIVATE"),
                NS(type="response.output_text.delta", delta="Public"),
                NS(type="response.completed", response=response),
            ]
        )
    )
    reply = await OpenAIProvider("test", client).complete(
        "test-model",
        [{"role": "user", "content": "chart", "images": ["data:image/png;base64,AAAA"]}],
        [],
    )
    assert reply.text == "Public" and reply.total_tokens == 15
    assert reply.calls[0].name == "market_price"
    assert "PRIVATE" not in str(reply)
    assert (
        client.responses.create.call_args.kwargs["input"][0]["content"][1]["type"] == "input_image"
    )


async def test_anthropic_official_client():
    result = NS(
        content=[
            NS(type="thinking", thinking="PRIVATE"),
            NS(type="text", text="مرحبا"),
            NS(type="tool_use", id="t", name="market_sessions", input={}),
        ],
        usage=NS(
            input_tokens=5,
            output_tokens=2,
            cache_read_input_tokens=3,
            cache_creation_input_tokens=4,
        ),
        _request_id="r",
    )
    stream = MagicMock()
    stream.__aiter__.return_value = []
    stream.get_final_message = AsyncMock(return_value=result)
    manager = MagicMock()
    manager.__aenter__ = AsyncMock(return_value=stream)
    manager.__aexit__ = AsyncMock()
    client = MagicMock()
    client.messages.stream.return_value = manager
    reply = await AnthropicProvider("test", client).complete(
        "test", [{"role": "user", "content": "hello"}], []
    )
    assert reply.text == "مرحبا" and reply.input_tokens == 12 and reply.total_tokens == 14
    assert "PRIVATE" not in str(reply)


async def test_zai_official_client_drops_reasoning():
    chunk = NS(
        id="r",
        usage=NS(prompt_tokens=10, completion_tokens=8, total_tokens=18),
        choices=[NS(delta=NS(content="Public", reasoning_content="PRIVATE", tool_calls=[]))],
    )
    client = MagicMock()
    client.chat.completions.create.return_value = iter([chunk])
    reply = await ZAIProvider("test", client).complete(
        "glm-test", [{"role": "user", "content": "test"}], []
    )
    assert reply.text == "Public" and reply.total_tokens == 18
    assert "PRIVATE" not in str(reply)
