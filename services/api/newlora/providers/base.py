import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

Delta = Callable[[str], Awaitable[None]]


def public_text(text: str) -> str:
    # Defense in depth for non-native tags. Native reasoning fields never enter this function.
    return re.sub(r"<(think|analysis|reasoning)>.*?(</\1>|$)", "", text, flags=re.S | re.I).strip()


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass
class Reply:
    text: str = ""
    calls: list[ToolCall] = field(default_factory=list)
    input_tokens: int | None = None
    output_tokens: int | None = None
    cached_input_tokens: int | None = None
    cache_write_tokens: int | None = None
    total_tokens: int | None = None
    request_id: str | None = None
    first_token_ms: float | None = None


class LLMProvider(Protocol):
    async def complete(
        self,
        model: str,
        messages: list[dict],
        tools: list[dict],
        *,
        on_delta: Delta | None = None,
        native: dict[str, Any] | None = None,
    ) -> Reply: ...
    async def models(self) -> list[dict]: ...
    async def close(self) -> None: ...


def assistant_message(reply: Reply) -> dict:
    return {
        "role": "assistant",
        "content": reply.text,
        "calls": [{"id": t.id, "name": t.name, "arguments": t.arguments} for t in reply.calls],
    }


class PublicTextStream:
    """Incremental defense against providers placing reasoning tags in public text."""

    def __init__(self):
        self.pending = ""
        self.hidden = False

    def feed(self, delta: str) -> str:
        self.pending += delta
        output = ""
        while self.pending:
            if self.hidden:
                match = re.search(r"</(?:think|analysis|reasoning)>", self.pending, re.I)
                if not match:
                    self.pending = self.pending[-24:]
                    break
                self.pending = self.pending[match.end() :]
                self.hidden = False
                continue
            index = self.pending.find("<")
            if index < 0:
                output += self.pending
                self.pending = ""
                break
            output += self.pending[:index]
            self.pending = self.pending[index:]
            end = self.pending.find(">")
            if end < 0:
                break
            tag = self.pending[: end + 1]
            if re.fullmatch(r"<(think|analysis|reasoning)>", tag, re.I):
                self.hidden = True
            else:
                output += tag
            self.pending = self.pending[end + 1 :]
        return output
