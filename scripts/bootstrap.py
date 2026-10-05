"""Write owner secrets locally; never prints any secret."""

import getpass
import secrets
from pathlib import Path

from argon2 import PasswordHasher
from cryptography.fernet import Fernet

path = Path(".env")
if path.exists():
    raise SystemExit(
        ".env already exists; rotate secrets deliberately, never overwrite encryption keys."
    )
password = getpass.getpass("Owner password (at least 14 characters): ")
if len(password) < 14:
    raise SystemExit("Use at least 14 characters.")
pg = secrets.token_hex(24)
values = {
    "MASTER_KEY": Fernet.generate_key().decode(),
    "JWT_SECRET": secrets.token_urlsafe(48),
    "BROWSER_TOKEN": secrets.token_urlsafe(48),
    "OWNER_PASSWORD_HASH": PasswordHasher().hash(password),
    "POSTGRES_PASSWORD": pg,
    "DATABASE_URL": f"postgresql+asyncpg://newlora:{pg}@postgres:5432/newlora",
    "REDIS_URL": "redis://redis:6379/0",
    "BROWSER_URL": "http://browser:8090",
    "PUBLIC_URL": "https://newlora.example.com",
    "DOMAIN": "newlora.example.com",
    "ARTIFACT_DIR": "/data/artifacts",
    "SEARCH_URL": "http://search:8080",
}
path.touch(mode=0o600)
path.write_text("\n".join(f"{k}='{v}'" for k, v in values.items()) + "\n")
print(
    "Created private .env. Set DOMAIN and PUBLIC_URL before deploying. Back up MASTER_KEY securely."
)
