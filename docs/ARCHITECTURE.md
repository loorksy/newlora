# Newlora architecture

Newlora is an independent, single-owner VPS trading research platform. It uses no nanobot runtime or provider gateway. Production is PostgreSQL + Redis + FastAPI + worker/scheduler/notifier/voice workers + an isolated Playwright service, with a native React Native Android client. OANDA is read-only market data; no order endpoint is exposed.

## Boundaries

- API authenticates owner devices, encrypts credentials, serves persisted resources and replayable events. Access tokens are short-lived; refresh tokens are hashed and revocable. Android stores them in Keystore via Keychain.
- Worker claims durable runs with PostgreSQL row locks, renewable leases and fencing tokens. Session runs serialize; task occurrences and tool effects have unique idempotency keys. External LLM calls can repeat after a crash; exactly-once remote calls are not claimed.
- Scheduler materializes due occurrences transactionally; PostgreSQL is the source of truth. Redis provides rate limits and health heartbeats, never the sole copy of important state.
- Agent selects tools through official SDK tool calls; routing uses a validated structured contract. No mandatory indicators, timeframes, sizing rules or analysis thresholds.
- OpenAI, Anthropic and Z.AI adapters normalize public text, tool calls and usage. Private reasoning blocks are discarded, never logged, persisted or streamed. Provider-native options remain adapter-specific.
- Chart workspace uses KLineChart Pro with an OANDA datafeed. The same controlled workspace renders in Android WebView and server Chromium. Deterministic overlays are followed by a screenshot fed to a vision-capable model.
- Browser has no provider keys, database credentials, Docker socket or host mounts. Its outbound proxy resolves and pins public IP addresses and rejects private destinations. The chart service uses a separate trusted local page; public browsing cannot reach it.
- Persisted event envelope supports cursor replay and reconnection. Public activity uses action identifiers and sanitized parameters, not model-generated reasoning.
- Notifications use a transactional outbox and FCM; call requests are in-app only. Android decides whether system policy permits full-screen presentation. Voice media flows by WebRTC to OpenAI; SDP/session authorization is brokered by the authenticated server with the official SDK.

## Durable entities

Owner credentials/settings, device sessions, conversations/messages, runs/events, tool effects, artifacts, recommendations/revisions, tasks/occurrences, memory checkpoints/facts/revisions, usage/pricing and notification outbox all live in PostgreSQL. Chart PNGs live in a persistent artifact volume with authenticated ownership checks. Original messages survive compaction. Conversation deletion cascades its content while separately managed durable memory can be inspected/deleted.

## Availability and trust

Retrieved pages and market/news text are untrusted data, never instructions. Tool allowlists scope subagents; only the lead agent can persist recommendations/tasks. Infrastructure limits cap steps/concurrency/time, not trading decisions. Unsupported models and unknown prices fail visibly; production screens contain no fixtures.

Model catalogs are refreshed server-side against official APIs and a versioned official-source capability manifest. Seven is a maximum target, never a reason to invent IDs or include deprecated models. Available counts and catalog verification timestamps are returned to the app.

See the implementation status and validation ledger in `VALIDATION.md` for what has actually been exercised. A successful mock flow does not establish live brokerage, FCM or Android audio behavior.
