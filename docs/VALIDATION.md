# Implementation and validation ledger

Checked 2026-10-04. This is an independent implementation, with real persistence and native build outputs. It is **not yet certified against the complete live-device/VPS acceptance flow**. No OANDA account, LLM API key, Firebase project, production signing identity, public domain or target VPS credentials were supplied for live acceptance. Production UI has no demonstration prices, recommendations or costs.

## Executed checks

| Check | Result and scope |
|---|---|
| Python lint/format | Ruff passes |
| Python types | mypy passes on all 20 API modules |
| Backend suite | 38 tests pass with SQLite; PostgreSQL rerun recorded below |
| Official SDK adapters | Mocked OpenAI/Anthropic/Z.AI clients exercise public text, tools, images, usage and private-field exclusion |
| Voice authorization | Mocked official Live, Realtime client-secret and Realtime SDP-broker APIs; ownership, secret exclusion and trusted usage deduplication |
| PostgreSQL persistence | 36-test suite passed against PostgreSQL 17 before the final two voice tests; no SQLite-only row-lock claim |
| Arabic mocked E2E | Structured intent → OANDA HTTP normalization → rendered-image fixture → multimodal input → recommendation → persistent monitoring → outbox/push simulation |
| Restart behavior | Expired leases, stale fencing, serialized conversation claims, occurrence/effect idempotency and original-history preservation tested |
| TypeScript | Type checks and ESLint pass |
| Mobile components | 9 Jest tests cover Arabic/English direction, drawer, Welcome chart exclusion, chat events, optional recommendation fields, selection artifacts, settings and bridge rejection |
| Chart bridge | 2 Vitest tests pass |
| Real chart renderer | Chromium runs the built KLineChart Pro bundle, renders Arabic labels and deterministic annotations, and creates actual PNG pixels |
| Android | arm64-v8a preview APK built; APK signature verified. Final native-export rebuild is recorded below |
| Docker images | API and browser production Dockerfiles build successfully |
| Docker services | Fresh Alembic migration, API auth/settings/Arabic conversation/queue, worker, scheduler, notifier and voice heartbeat startup passed against actual PostgreSQL/Redis |
| Browser container | Authenticated high-resolution PNG render passes with non-root Chromium sandbox, read-only root filesystem, no-new-privileges and all capabilities dropped; loopback browsing is blocked by the public-only proxy |

The image fixtures used by tests are not production responses. The actual browser PNG smoke test is separate from the mocked Arabic provider flow. No paid provider calls are part of CI.

## Remaining live acceptance

1. Deploy Compose on the intended VPS with a DNS name, TLS, persistent volumes and a tested backup/restore process. Confirm `/health/ready` and restart all services without losing records.
2. Install the signed APK on a physical Android device. Configure real OANDA and at least one LLM provider through Settings. Verify the account model catalog and instrument availability, including regional metals support.
3. Analyze an instrument in Arabic and English with a vision-capable model. Inspect current prices/tradeability, selected timeframes, chart annotations, source links, optional recommendation values and recorded usage. Exercise each provider's multi-turn tool behavior and error recovery.
4. Create a user-defined monitoring/news task. Close the phone app, restart the worker, and verify the task runs and FCM delivers a matching notification. Test normal, urgent and incoming-call policies without adding universal market thresholds.
5. Test GPT-Live and Realtime speech, barge-in, Arabic/English switching, tool delegation, mute, speaker/Bluetooth, reconnect and accepted urgent calls. Compare sideband usage with provider billing. Test Android notification/full-screen permission fallbacks.
6. Inspect mixed Arabic/Latin typography, keyboard behavior, accessibility scaling, chart interactions, Save/Share and offline/reconnect behavior on physical devices.

## Deliberate boundaries and current limitations

- Single-owner VPS deployment, not multi-tenant account registration. OANDA has no automatic order-execution capability.
- Charts load a bounded OANDA snapshot and refresh while visible. Deep scrolling beyond that snapshot is not implemented; historical research can explicitly request bounded date ranges through the agent.
- File/image attachments as user inputs, editable spreadsheet cells, iOS delivery and a light theme are not implemented. Chart-image Save/Share targets Android.
- Catalogs only expose officially documented, suitable IDs. An account can show fewer than seven verified models. Anthropic's documentation endpoint returned HTTP 403 during inspection; official SDK model types and the account listing are used, with that provenance recorded.
- Public browser interactions are bounded and per-request; no general host shell or arbitrary computer filesystem is available. Public web/search access depends on the VPS network and configured SearXNG engines.
- Prices/costs are never fabricated. The pricing manifest has no unverified rates, so monetary cost remains unknown. GPT-Live audio seconds and Realtime response tokens use authenticated server events. The optional client-secret-only voice fallback cannot authoritatively meter media tokens and leaves them unknown.
- External LLM calls and push delivery cannot promise exactly-once behavior across a crash. Stored effects use durable keys and leases; a nondeterministic replan that changes mutation arguments can still require duplicate reconciliation. No live reliability/SLA or independent security audit is claimed.

See README for exact commands and CI workflows. Generated APKs, screenshots, credentials and test databases are excluded from Git.
