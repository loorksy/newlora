from collections.abc import Callable

from .anthropic import AnthropicProvider
from .base import LLMProvider
from .openai import OpenAIProvider
from .zai import ZAIProvider


def provider(name: str, key: str) -> LLMProvider:
    factories: dict[str, Callable[..., LLMProvider]] = {
        "openai": OpenAIProvider,
        "anthropic": AnthropicProvider,
        "zai": ZAIProvider,
    }
    return factories[name](key)
