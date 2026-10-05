# Implementation and validation ledger

Hardening checked 2026-10-05 against the independent Newlora alpha. PR #1 must remain **Draft**. No real OANDA account, LLM credential, Firebase project, production signing identity, public domain, or target VPS was available. Local validation is not production certification.

## Automated checks

| Check | Observed result |
|---|---|
| Ruff lint / format | Pass |
| mypy | Pass, 29 API modules |
| Backend on SQLite | 100 tests pass |
| Backend on PostgreSQL 17 | The same 100 tests pass using actual PostgreSQL transactions/indexes/locks |
| ESLint / TypeScript | Pass across mobile, contracts and chart |
| Mobile Jest | 30 tests pass |
| Chart Vitest | 15 tests pass |
| Chart production bundle | Vite/TypeScript build passes |

There are **145 unique passing cases**, 92 more than the baseline's 53. PostgreSQL and SQLite execution do not count as separate unique tests. [Exact test inventory](TEST_INVENTORY.md) lists names and the complete backend collection. Tests retain existing provider/runtime/security coverage and add retrieval, journal recovery, attachments, recurrence/DST, precision, catalog/probes/pricing, notifications, voice and mobile behavior.

### Mocked provider tests

OpenAI, Anthropic and Z.AI tests mock their official SDK clients. The Arabic E2E and additional `worker-restart` E2E exercise intent → OANDA HTTP normalization → chart-image fixture → multimodal input → recommendation → task → replacement worker → simulated push. They do not establish live market correctness, provider access, or FCM delivery. Voice authorization, provider events, research delegation and usage dedupe are mocked; no microphone/WebRTC media was exercised by Jest.

## Local infrastructure and builds

- Both production Dockerfiles built successfully during this pass. The API image contains the new dependency lock and schema migration; the browser image contains instrument metadata support. Small subsequent runtime safeguards and the metadata declaration for the GIN index were verified through source tests and migration comparison; see final build notes below for exact artifact scope.
- Compose configuration validates. Fresh PostgreSQL/Redis volumes and Alembic migration to `0002_hardening` passed. The metadata consistency check reports `No new upgrade operations detected` with the final GIN index declaration.
- Real container API smoke passed authentication, Arabic conversation persistence, authenticated CSV upload and attachment/message linkage. Secret validation errors did not echo submitted values.
- Worker, scheduler, notifier and voice processes started and emitted Redis health heartbeats. They were tested as separate processes inside the API container after the full stack hit the workspace limit; this is not a successful full-topology startup claim.
- A real process terminated with `os._exit(27)` immediately after task commit and before the tool-result checkpoint. A separate replacement process acquired the expired run, resumed, and found exactly one recommendation and one recurring task. Two separate scheduler processes produced exactly one occurrence. Providers in this smoke were mocked; storage was real PostgreSQL.
- Local Chromium rendered the production chart bundle with Arabic labels and drawings. The browser Docker container separately returned a real high-resolution annotated PNG, with precision metadata, non-root Chromium sandbox, read-only root filesystem, dropped capabilities and no-new-privileges. Unauthenticated render returned 401; malformed input returned a public code without submitted data.
- SSRF/private-address/proxy behavior is covered by automated tests. A successful live public-page fetch through the production proxy is still an acceptance item. Do not mistake a stopped proxy or connection failure for proof of SSRF protection.
- Full concurrent Compose startup was attempted and failed with `no space left on device` in this **32 GB workspace using Docker's vfs driver**. Temporary containers were removed and browser validation ran sequentially. No production isolation setting was weakened to fit this environment. Full-stack startup/restart must be repeated on the target VPS with adequate storage.

### Android artifact

Native Android attachment selection and the complete JavaScript bundle build with JDK 17, Android SDK 36, React Native 0.81.5 and `:app:assemblePreview -PreactNativeArchitectures=arm64-v8a`. The preview uses a development signing identity; it is not a production-signed release. Output is `apps/mobile/android/app/build/outputs/apk/preview/app-preview.apk`; generated binaries remain outside Git. Final build/hash recorded below after validation.

## Live acceptance checklist — not yet executed

Record device/VPS versions, provider/model IDs, timestamps, screenshots and results for each item. Keep credentials out of evidence.

### Deployment and recovery

- [ ] Deploy the complete production Compose topology on the intended VPS; check every service's health and resource limits.
- [ ] Configure DNS and TLS; verify Android rejects HTTP and invalid certificates.
- [ ] Back up PostgreSQL, encrypted artifact files and the master key separately; restore to a clean instance and verify chats, attachments, memory revisions, journals, tasks and usage.
- [ ] Restart Redis; verify it loses no durable records and workers recover coordination.
- [ ] Restart API and worker during tool execution and after mutation commit; assert one recommendation/task/outbox record and a resumed answer.
- [ ] Restart scheduler immediately before a timezone recurrence; verify one scheduled occurrence, including DST cases.
- [ ] Restart notifier with a pending push, then cancel its task; verify suppression before handoff and stable device dedupe after retries.
- [ ] Restart browser during chart rendering; verify safe retry/error, healthy sandbox, public URL success and loopback/private/metadata-IP denial.
- [ ] Restart voice worker during a call; inspect recovery and usage dedupe.

### Providers and market research

- [ ] Configure a real OANDA Practice account; verify account-visible Forex/metals and unsupported instruments.
- [ ] Test real OpenAI, Anthropic and Z.AI keys separately: valid, invalid, unavailable model, rate-limited/provider unavailable.
- [ ] Refresh model catalogs; verify official account listing intersections, documented capabilities, provenance and fewer-than-seven behavior.
- [ ] Request real `XAU_USD` analysis in Arabic and English. Compare actual OANDA bid/ask, timestamps, candles, tradeability and session metadata with source responses.
- [ ] Render chosen timeframes; inspect actual chart pixels and final annotations through a vision-capable provider. Confirm gold, JPY and standard FX precision.
- [ ] Create a recommendation with only justified optional values; verify its revisions, cross-chat historical comparison and source links.
- [ ] Create a monitoring task and a local-time recurring task; close/kill Android, wait for a real condition, and verify the VPS continues.
- [ ] Upload a gallery chart image, PDF, plain text and CSV; verify bounded extraction, provider image input, ownership and conversation deletion cleanup.
- [ ] Confirm explicit user preference correction survives consolidation and restart without promoting inferred identity or transient prices.
- [ ] Compare recorded text/voice usage with provider records; unknown cost stays null, known fixture pricing retains its version. Do not introduce unverified live rates.

### Physical Android, notifications and voice

- [ ] Install the arm64 APK on a physical Android device; separately test another supported ABI if distributing one.
- [ ] Exercise Arabic RTL and English LTR: drawer, mixed symbols/prices/model IDs, keyboard, attachments, tables, font scaling and accessibility.
- [ ] Test HTTPS reconnect, replayed chat events, duplicate events, queued/analyzing/waiting/completed/failed/cancelled states, and leaving the app during research.
- [ ] Configure FCM/Notifee permissions/channels. Verify normal and urgent notifications in foreground, background and killed app.
- [ ] Verify exact chat/task/recommendation deep links, duplicate delivery suppression, generic lock-screen copy and task cancellation while push is pending.
- [ ] Request an incoming **in-app AI call** from a user-defined monitoring condition; test accept, decline, expired/cancelled calls and Android full-screen permission fallbacks. No PSTN call is involved.
- [ ] Test real GPT-Live and Realtime WebRTC audio, Arabic/English switching, barge-in, mute, speaker, Bluetooth and microphone permission denial.
- [ ] Disconnect/reconnect media; verify a fresh authorized session, closed-call rejection, research failure UX, duplicate server event handling and usage dedupe.

## Boundaries and known limitations

- Single-owner VPS scope, no automatic order execution, no fixed analysis/risk strategy. No live reliability/SLA or independent security audit is claimed.
- Cross-chat retrieval uses PostgreSQL lexical full-text plus metadata, not embeddings. Cross-language retrieval may need query translation or canonical instrument filters. Automatic canonical consolidation currently promotes evidenced language/report-format/report-detail preferences; broader research remains indexed rather than becoming identity facts.
- Journal creation identity is one recommendation/task per structured subject per run. Changed wording cannot duplicate that creation. Multiple independent creations for the same subject in one run currently collapse; separate user requests have separate identities. Updates/artifacts use persisted tool-call slots. This limitation must be considered before claiming unrestricted multi-plan creation.
- Durable checkpoints resume committed tools/answers. External provider requests, ephemeral browser actions and subagent research can still repeat after a crash; no external exactly-once guarantee is made.
- Attachments support PNG/JPEG/WebP, bounded text-based PDF, UTF-8 text and CSV. Parsing runs in a resource-limited subprocess, not a separate OS/container sandbox. Scanned PDFs need OCR that is not implemented. Camera capture, offline attachment drafts and broader office formats are not included. Unsent uploaded files remain until removed or their conversation is deleted.
- RRULE uses explicit IANA timezone/start. Spring gaps skip; fall folds run once. Downtime coalesces missed occurrences. Holiday/session interpretation requires task-specific context and separate OANDA tradeability checks.
- Android notification receipt dedupe is persisted before display, so a crash in that narrow window can suppress the visual alert; the underlying result remains durable in chat. FCM handoff cannot be recalled. Real manufacturer background restrictions need device testing.
- The pricing registry intentionally has no uncertain production rates. Audio seconds/tokens remain unknown when authoritative provider events are missing; unknown is never zero.
- Charts show bounded OANDA snapshots; deep historical scrolling, editable spreadsheet cells, iOS delivery and a light theme remain outside this pass.

## GitHub validation

Local results above are independent of GitHub Actions. Earlier remote runs were blocked before execution with: **“The job was not started because your account is locked due to a billing issue.”** Baseline reruns include https://github.com/loorksy/newlora/actions/runs/37224713851 . Refresh the exact head-run status after pushing; do not mark CI passing unless jobs execute successfully.

Earlier release uploads returned HTTP 400 `Bad Content-Length`; the empty draft release was deleted. No fake GitHub Release is created and no binary is committed. Keep PR #1 Draft until the live checklist passes.
