# Newlora

An independent, persistent AI trading research assistant for OANDA Forex and metals, with a native Arabic/English Android client. No automatic order execution. No fixed trading strategy. No provider gateway: OpenAI → `openai`, Anthropic → `anthropic`, Z.AI → `zai-sdk`.

The platform includes a model-driven tool loop, scoped research agents, real rendered chart input, recommendations, durable monitoring, replayable events, revisioned memory, usage accounting, encrypted credentials, and in-app OpenAI voice. See [validation](docs/VALIDATION.md) for exercised checks and external acceptance work. This is not a claim that untested live services are production-validated.

## Local development

Prerequisites: Python 3.12+, uv, Node 22+, Docker; JDK 17 and Android SDK for Android.

```sh
uv sync --frozen
npm ci
npm run chart:build
uv run python scripts/bootstrap.py
```

Set `DOMAIN` and `PUBLIC_URL` in the private `.env`. For local backend development, point `DATABASE_URL`, `REDIS_URL`, `BROWSER_URL`, and `ARTIFACT_DIR` at your local services/directories. Configure TLS locally if testing a physical Android device: the client accepts HTTPS endpoints.

```sh
docker compose up -d postgres redis
docker compose build api
docker compose build browser
docker compose run --rm migrate
docker compose up -d
```

For host processes with local service addresses:

```sh
uv run alembic upgrade head
uv run uvicorn newlora.api:app --reload --no-access-log
uv run python -m newlora.jobs worker
uv run python -m newlora.jobs scheduler
uv run python -m newlora.jobs notifier
uv run python -m newlora.voice
```

The API is not a task runner: worker, scheduler, notifier and voice worker are separate long-running services. The browser requires the bundled chart and the public-only egress proxy.

## Android

```sh
npm ci
cd apps/mobile/android
./gradlew assemblePreview -PreactNativeArchitectures=arm64-v8a
```

Install `apps/mobile/android/app/build/outputs/apk/preview/app-preview.apk`. Preview is a self-contained, debug-key-signed evaluation build with a bundled JS application; it does not require Metro or Expo Go. `assembleDebug` is for Metro development. For production, configure a private signing key using `NEWLORA_KEYSTORE`, `NEWLORA_STORE_PASSWORD`, `NEWLORA_KEY_ALIAS`, `NEWLORA_KEY_PASSWORD`, then `./gradlew assembleRelease`. Never distribute the preview signing identity as your production identity.

Open the app, enter your HTTPS server address and owner password, then Settings:

1. Save OANDA API key, account number, and Practice/Live environment. Test the connection.
2. Save at least one LLM provider key. Test and refresh its model catalog.
3. Select a main model; optionally select a separate research model and an OpenAI voice model.
4. For visual chart analysis, select a model whose verified catalog supports vision (or have the lead delegate to a vision-capable research model).
5. Ask in Arabic or English for analysis and, if desired, a recommendation and a monitoring schedule.

API keys are sent once over TLS, encrypted on the backend, and never returned to Android. Device tokens use Android Keystore through Keychain.

For notifications, register the Android application `com.newlora` in Firebase, place `google-services.json` under `apps/mobile/android/app/`, and mount the matching service-account JSON into the notifier using `FCM_CREDENTIALS`. Neither file belongs in Git. Enable notification permission on the device. Android decides whether full-screen call presentation is permitted; the fallback is an actionable notification. These are in-app AI calls, not PSTN calls.

## Tests and checks

```sh
uv run ruff check services tests scripts
uv run ruff format --check services tests scripts
uv run mypy
uv run pytest -q
npm run lint
npm run typecheck
npm test
npm run chart:build
uv run playwright install chromium
uv run python scripts/chart_smoke.py
```

Set `TEST_DATABASE_URL` to an **isolated disposable PostgreSQL database** to run the backend suite with real row locks. The test fixture drops/recreates its tables. Provider tests mock official SDK clients, and the Arabic end-to-end flow uses test-only market/renderer/provider fixtures. No paid calls run in normal CI.

[Deployment](docs/DEPLOYMENT.md) · [Architecture](docs/ARCHITECTURE.md) · [Agent](docs/AGENT_RUNTIME.md) · [Providers](docs/PROVIDERS.md) · [Security](docs/SECURITY.md) · [Source inventory](docs/NANOBOT_SOURCE_INVENTORY.md)
