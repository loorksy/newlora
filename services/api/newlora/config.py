from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+asyncpg://newlora:newlora@postgres:5432/newlora"
    redis_url: str = "redis://redis:6379/0"
    master_key: SecretStr
    jwt_secret: SecretStr = Field(min_length=32)
    owner_password_hash: SecretStr
    browser_token: SecretStr
    browser_url: str = "http://browser:8090"
    artifact_dir: Path = Path("/data/artifacts")
    catalog_manifest: Path = Path("packages/shared/models.json")
    search_url: str = "http://search:8080"
    public_url: str = "https://localhost"
    fcm_credentials: str | None = None
    max_agent_steps: int = Field(default=16, ge=1, le=100)
    max_subagents: int = Field(default=3, ge=1, le=16)
    lease_seconds: int = Field(default=120, ge=30)
    provider_timeout: int = Field(default=90, ge=10)
    context_message_limit: int = Field(default=40, ge=10)


@lru_cache
def settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # Populated by pydantic-settings environment.
