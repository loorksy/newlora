# Implementation and validation ledger

Hardening checked 2026-10-05 against the independent Newlora alpha. PR #1 must remain **Draft**. No real OANDA account, LLM credential, Firebase project, production signing identity, or public domain was available. The isolated deployment section below is the live-acceptance record for this host. It does not replace the earlier local ledger, and it is not production certification.

## Isolated deployment acceptance

Checked 2026-10-05 on this host after `9fb8d0de7e0655741225c197525abcbb1d7e4e10`. The machine is the Cursor agent environment (`hostname` `cursor`, Ubuntu 24.04.4 LTS, 4 vCPU, 15 GiB RAM, about 198 GiB free after the images were built). A read-only inventory found no other application directories under `/opt`, `/srv`, or `/var/www`, and no other Compose projects. The host PostgreSQL 16 cluster on `127.0.0.1:5432`, Cursor services, Docker storage driver (`vfs`), and `/var/lib/docker` were not modified. No other project's containers, volumes, networks, or config files were stopped, deleted, or read for secrets.

Newlora is deployed only at `/opt/newlora/app`, Compose project `newlora`, commit `9fb8d0de7e0655741225c197525abcbb1d7e4e10`. The running containers are that commit. This ledger section is documentation only and was not rebuilt into those images. Fresh images, not the earlier historical tags: API `sha256:d1c2e1913dfead6cb7badacd726efdf48349ff727d83feba7712b09426911144`, browser `sha256:bfcbc4b06388ff19a21beb8ac5053d149cfefb9993580da4fc9dab91ab92ba64`. Secrets are in `/opt/newlora/app/.env` mode `0600` and were not committed. No public hostname was provided, so Caddy was not started and no DNS or TLS record was changed. The API is bound to `127.0.0.1:18080` only.

Stale `iptables-legacy` rules on this host dropped forwarded traffic for every bridge except `docker0`, while Docker 29 had written the Newlora rules into nftables. Newlora container networking and egress were impossible until legacy forward, established-return, and outbound masquerade rules were added for the Newlora bridges only. Those rules were not a global policy change and were not applied to another project. PostgreSQL on the internal network still cannot reach the public internet.

| Item | Result |
|---|---|
| Postgres 17.11, Redis 7.4, migration `0002` | PASS |
| API, worker, scheduler, notifier, voice, browser, egress, search health | PASS (`/health/ready` 200 after a Newlora Postgres restart) |
| Postgres, Redis, browser, search, and egress not published on the host | PASS |
| Browser has no Docker socket or host mount; read-only root, all capabilities dropped, seccomp and no-new-privileges set | PASS |
| API login works; unauthenticated settings return `authentication_required`; credential values are not in service logs | PASS |
| Full Playwright stack loads `http://example.com` and `https://example.com` | PASS. Title `Example Domain`, body text present, screenshot PNG 75,694 bytes, magic `89504e47` |
| Egress proxy rejects loopback, `localhost`, `10.1.1.1`, `172.16.0.1`, `192.168.1.1`, and `169.254.169.254` | PASS, HTTP 403, no body |
| Playwright `/browse` of those HTTP URLs | No page content (`text_len` 0). The endpoint returns HTTP 200 for the empty proxy response rather than an error. `https://169.254.169.254/` returns 502 `browser_unavailable`. SSRF protection was not weakened |
| Synthetic `XAU_USD` chart render through the browser | PASS, PNG 2,400×1,500. This did not use OANDA |
| Chart annotation | A horizontal drawing was submitted and a PNG was returned. No vision model inspected the pixels. Visual annotation acceptance is NOT TESTED |
| OANDA Practice, OpenAI, Anthropic, Z.AI | BLOCKED. No Newlora credentials were present. Other projects were not searched |
| Real `XAU_USD` analysis, vision inspection, recommendation, web/news research by the agent | BLOCKED. Search itself answers `/healthz` 200, which is not a research result |
| Crash recovery during a live analysis, background continuation after a client disconnect | BLOCKED. No provider run was started, and no Android client was connected |
| Tasks, memory retrieval, FCM, voice | BLOCKED. No provider credentials, Firebase project, or Android device |
| Attachment PNG, JPEG, WebP, PDF, TXT, and CSV upload | PASS. Responses contained no filesystem path. TXT and CSV extraction matched the uploaded text. PDF stored an encrypted extraction field |
| Deployed hydration | PASS. The PNG attachment hydrated to a `data:image/png;base64,` URL with no path. Thirteen references failed with `multimodal_payload_too_large` before any provider call. A model-run checkpoint was NOT TESTED |
| Backup and restore | PASS for an isolated check. `pg_dump` restored into `newlora_restore` at Alembic `0002`, then that database was dropped. An artifact marker was archived and restored. The master key is only on this same disk at `/opt/newlora/secrets/master-key` mode `0600`. Off-host backup is NOT TESTED |
| Public DNS and TLS | NOT TESTED. No domain was provided |
| Android arm64 preview APK from this commit | PASS build and debug-signature verification. SHA-256 `52dbc530e6b2353228344ff8194eb11f347a508f2a56434dbcd17f7457e2579f`. `lib/arm64-v8a` only. The bundle contains `multimodal_payload_too_large`. Not published |

No product source change was required for this deployment. PR #1 stays Draft. Live provider, device, DNS/TLS, and in-flight crash acceptance are still open.

## Deployment completion

The only commit after the deployed product commit `9fb8d0de7e0655741225c197525abcbb1d7e4e10` was the documentation ledger. Images were not rebuilt. Running API image `sha256:d1c2e1913dfead6cb7badacd726efdf48349ff727d83feba7712b09426911144`. Running browser image `sha256:bfcbc4b06388ff19a21beb8ac5053d149cfefb9993580da4fc9dab91ab92ba64`.

| Item | Result |
|---|---|
| Restart policy `unless-stopped` on postgres, redis, api, worker, scheduler, notifier, voice, browser, egress, and search | PASS. Docker reports that policy on each running container |
| Restart of those Newlora containers | PASS. `/health/ready` returned 200, Alembic stayed `0002`, and the artifact marker `newlora-acceptance` remained |
| Reboot persistence | NOT TESTED. Reboot was not performed. PID 1 is `tini`, not systemd, so `newlora-firewall.service` is installed and enabled on disk but init did not start it. Current iptables rules remain until this kernel stops |
| Newlora firewall script | PASS. `/opt/newlora/bin/newlora-firewall.sh apply` is idempotent and touches only `newlora_*` bridges. Exact rules and rollback are in `DEPLOYMENT.md` |
| Login, empty settings, and rejected empty credential body | PASS. `GET /settings` has `credentials: {}`. `PUT` with an empty body returns 422 `invalid_request` |
| Credential test with nothing stored | PASS as an empty state. `POST /settings/credentials/{openai,anthropic,zai,oanda}/test` returns `connectionStatus: failed` and no key |
| Conversation and queued message without providers | PASS. The run ends `failed` with `model_not_configured` |
| Browser and SSRF after restarts | PASS. `https://example.com` title `Example Domain`, PNG 75,694 bytes. Metadata and loopback HTTP browse return no text |
| Public domain and TLS | NOT TESTED. No hostname was provided. API remains `127.0.0.1:18080` |
| Fresh arm64 preview APK | PASS. `assemblePreview` and `apksigner verify` succeeded. Debug signing. ABI `arm64-v8a` only. SHA-256 `52dbc530e6b2353228344ff8194eb11f347a508f2a56434dbcd17f7457e2579f`. The bundle contains `multimodal_payload_too_large`. Path `/opt/newlora/releases/newlora-preview-arm64.apk`. Not committed |
| OANDA, OpenAI, Anthropic, Z.AI, Firebase, physical Android, voice, and FCM | BLOCKED until those Newlora credentials and a device are added through the documented settings and FCM path |

Provider keys are added later with `PUT /settings/credentials/{openai|anthropic|zai|oanda}` and are not environment variables. OANDA must include the practice account id and `"environment":"practice"`. Firebase uses `FCM_CREDENTIALS` only after a Newlora service-account file is mounted. No fake credentials were written.

## Automated checks

| Check | Observed result |
|---|---|
| Ruff lint / format | Pass |
| mypy | Pass, 30 API modules |
| Backend on SQLite | 117 tests pass |
| Backend on PostgreSQL 16.15 | The same 117 tests pass using actual PostgreSQL transactions/indexes/locks |
| ESLint / TypeScript | Pass across mobile, contracts and chart |
| Mobile Jest | 30 tests pass |
| Chart Vitest | 15 tests pass |
| Chart production bundle | Vite/TypeScript build passes |

There are **162 unique passing cases**, 109 more than the baseline's 53. PostgreSQL and SQLite execution do not count as separate unique tests. [Exact test inventory](TEST_INVENTORY.md) lists names and the complete backend collection. Tests retain existing provider/runtime/security coverage and add retrieval, journal recovery, attachments, recurrence/DST, precision, catalog/probes/pricing, notifications, voice, checkpoint image references, crash-safe chart rendering, transient-screenshot recovery, hydrated image limits, and mobile behavior.

### Mocked provider tests

OpenAI, Anthropic and Z.AI tests mock their official SDK clients. The Arabic E2E and additional `worker-restart` E2E exercise intent → OANDA HTTP normalization → chart-image fixture → multimodal input → recommendation → task → replacement worker → simulated push. They do not establish live market correctness, provider access, or FCM delivery. Voice authorization, provider events, research delegation and usage dedupe are mocked; no microphone/WebRTC media was exercised by Jest.

## Checkpoint and chart recovery pass

Checked on this workspace after `e8dae596e05805ee0d078fe7e7666205d8422519`:

- Ruff lint, Ruff format, and mypy passed (30 API modules, including checkpoint serialization).
- Backend pytest passed twice: 112 tests on SQLite and the same 112 on PostgreSQL 16.15. PostgreSQL 17 was not installed here.
- Fresh Alembic `upgrade head` on an empty PostgreSQL 16 database reached revision `0002`, and `alembic check` reported `No new upgrade operations detected`.
- ESLint, TypeScript, Jest (30), chart Vitest (15), and the production chart bundle passed.
- The public egress proxy, unchanged, returned HTTP 200 for `https://example.com` and `http://example.com`, and HTTP 403 for `127.0.0.1`, `10.0.0.1`, and `169.254.169.254`. SSRF checks were not weakened. The full Playwright browser container was built but not used for a live page load in this pass.
- API image `newlora-api:local` built with BuildKit: `sha256:455e7487c07dbfa13aea5cc0c25922aa13bd22cf12e4059e9db305cc22e37a4f`. Browser image `newlora-browser:local`: `sha256:da38ba0c1874dc5980c47987f2588a7fb1835886efa068365d6af0e727a3c06f`. This host's Docker daemon needed the vfs storage driver because overlay mounts were rejected; that is an environment limit, not a Dockerfile change.
- arm64 preview APK rebuilt with JDK 17, Android SDK 36, build-tools 36.0.0 and 35.0.0, NDK 27.1.12297006, and `./gradlew --no-daemon assemblePreview -PreactNativeArchitectures=arm64-v8a`. Build succeeded in 2m 8s. `apksigner verify` passed for the debug signing certificate. The package contains `lib/arm64-v8a` and no other ABI. It is not committed. SHA-256: `9cde3205f2a4c06d7be182c589b327791403fbd0f1f20e559c1152b0cacb0b92`. Output: `apps/mobile/android/app/build/outputs/apk/preview/app-preview.apk`.

## Recovery semantics cleanup

Checked on this workspace after `251c3c11d54cf9dc7184690dd240c0b3df8e5d0e`. Docker images and the Android APK were not rebuilt for this pass. The hashes in the checkpoint section above are from that earlier build: the API image does not contain this hydration change, and the APK does not contain the new `multimodal_payload_too_large` locale string. An unknown mobile code falls back to the raw public code until the next APK build.

- A recovered message whose images are only unrestorable `transient_image` markers no longer tells the model to inspect a screenshot. The provider-facing text says the previous worker's screenshot is unavailable and must be taken again. Chart artifacts and uploaded attachments still hydrate. Screenshot bytes are still not written into the checkpoint.
- One provider call fails closed with `multimodal_payload_too_large` when hydration would exceed 12 images, 32 MiB of raw image bytes, or 48 MiB of expanded data-URL payload. The runtime does not send a partial image set, and the provider is not called after that validation fails.
- Ruff lint, Ruff format, and mypy passed. Backend pytest passed twice: 117 tests on SQLite and the same 117 on PostgreSQL 16.15. ESLint, TypeScript, Jest (30), chart Vitest (15), and the production chart bundle passed.

## Local infrastructure and builds

- Both production Dockerfiles were rebuilt successfully from hardening commit `0cce172`: API `sha256:d141ac524a12c9c646fd3931101e909480d95fec0220c1f7dfe89f17e54c476d`, browser `sha256:3b79918fd4f82a67ec0c1b3ce2e424341a2a6aecde7d1dba2dfd577bae90c413`. These contain the mutation/task/voice safeguards and schema/index changes. The later optional manifest-path argument for the offline verifier was checked by the full host suites; images were not rebuilt for that small maintenance-only follow-up.
- Compose configuration validates. Fresh PostgreSQL/Redis volumes and Alembic migration to `0002_hardening` passed. The metadata consistency check reports `No new upgrade operations detected` with the final GIN index declaration.
- Real container API smoke passed authentication, Arabic conversation persistence, authenticated CSV upload and attachment/message linkage. Secret validation errors did not echo submitted values.
- Worker, scheduler, notifier and voice processes started and emitted Redis health heartbeats. They were tested as separate processes inside the API container after the full stack hit the workspace limit; this is not a successful full-topology startup claim.
- A real process terminated with `os._exit(27)` immediately after task commit and before the tool-result checkpoint. A separate replacement process acquired the expired run, resumed, and found exactly one recommendation and one recurring task. Two separate scheduler processes produced exactly one occurrence. Providers in this smoke were mocked; storage was real PostgreSQL.
- Local Chromium rendered the production chart bundle with Arabic labels and drawings. The browser Docker container separately returned a real high-resolution annotated PNG, with precision metadata, non-root Chromium sandbox, read-only root filesystem, dropped capabilities and no-new-privileges. Unauthenticated render returned 401; malformed input returned a public code without submitted data.
- Historical result from the earlier `0cce172` workspace, superseded by the proxy check in the checkpoint pass above: the browser image rendered actual annotated Arabic pixels; its egress proxy rejected loopback, private and metadata IPs with 403; malformed browser input did not echo submitted data. In that earlier workspace, public `https://example.com` browsing returned a safe 502, and a direct HTTP client through the same proxy received `ProxyError 403 Forbidden` even though public DNS validation passed. That 502 is not the current result. The later check on this workspace got HTTP 200 for both `http://example.com` and `https://example.com` through the egress proxy, and HTTP 403 for `127.0.0.1`, `10.0.0.1`, and `169.254.169.254`. No network/isolation/TLS safeguard was disabled. A live page load through the full Playwright browser stack was not part of either check.
- Full concurrent Compose startup was attempted and failed with `no space left on device` in this **32 GB workspace using Docker's vfs driver**. Temporary containers were removed and browser validation ran sequentially. No production isolation setting was weakened to fit this environment. Full-stack startup/restart must be repeated on the target VPS with adequate storage.

### Android artifact

Historical build from the earlier hardening workspace, superseded by the checkpoint-pass APK above (`9cde3205f2a4c06d7be182c589b327791403fbd0f1f20e559c1152b0cacb0b92`). Native Android attachment selection and the complete JavaScript bundle were built with JDK 17, Android SDK 36, React Native 0.81.5 and `:app:assemblePreview -PreactNativeArchitectures=arm64-v8a`. The preview uses a development signing identity; it is not a production-signed release. Output is `apps/mobile/android/app/build/outputs/apk/preview/app-preview.apk`; generated binaries remain outside Git. That earlier build succeeded in 8m 7s; APK signature verification passed. SHA-256: `f523d6df361d415709067468672f1129dc6155a5f39b8cd35bde52ac2b5f1367`. The Metro source map was compared with the call-screen source to confirm inclusion of the reconnect cleanup fix.

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
- [ ] Restart browser during chart rendering; verify safe retry/error, healthy sandbox, and loopback/private/metadata-IP denial.
- [ ] Load a public page through the full Playwright browser stack and return a screenshot to the agent. Local evidence so far is only the egress proxy: public `http://example.com` and `https://example.com` returned 200, and loopback, private, and metadata IPs returned 403. The Playwright container was built, but a real live page navigation through that stack was not validated.
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
- Durable checkpoints resume committed tools/answers. Image bytes are not stored in `Run.checkpoint`; chart and upload images are rehydrated from the artifact volume, and browser screenshot pixels are not retained across a crash. A recovered provider message does not claim that missing screenshot is still visible; the agent has to call the browser tool again. Hydrating a provider call fails closed, without a partial image set, when that call would exceed 12 images, 32 MiB of raw bytes, or 48 MiB of expanded payload. External provider requests, ephemeral browser actions and subagent research can still repeat after a crash. A rerun subagent can render another chart because its tool-call slot is new. No external exactly-once guarantee is made.
- Attachments support PNG/JPEG/WebP, bounded text-based PDF, UTF-8 text and CSV. Parsing runs in a resource-limited subprocess, not a separate OS/container sandbox. Scanned PDFs need OCR that is not implemented. Camera capture, offline attachment drafts and broader office formats are not included. Unsent uploaded files remain until removed or their conversation is deleted.
- RRULE uses explicit IANA timezone/start. Spring gaps skip; fall folds run once. Downtime coalesces missed occurrences. Holiday/session interpretation requires task-specific context and separate OANDA tradeability checks.
- Android notification receipt dedupe is persisted before display, so a crash in that narrow window can suppress the visual alert; the underlying result remains durable in chat. FCM handoff cannot be recalled. Real manufacturer background restrictions need device testing.
- The pricing registry intentionally has no uncertain production rates. Audio seconds/tokens remain unknown when authoritative provider events are missing; unknown is never zero.
- Charts show bounded OANDA snapshots; deep historical scrolling, editable spreadsheet cells, iOS delivery and a light theme remain outside this pass.

## GitHub validation

Local results above are independent of GitHub Actions. Remote runs are blocked before any step executes with: **“The job was not started because your account is locked due to a billing issue.”** Baseline reruns include https://github.com/loorksy/newlora/actions/runs/37224713851 . The hardening commit `0cce17216a91d784699946f5255ea1ac61b863a5` triggered [CI run 37293553792](https://github.com/loorksy/newlora/actions/runs/37293553792) and [Android run 37293549934](https://github.com/loorksy/newlora/actions/runs/37293549934). This cleanup commit triggered [CI run 37309204529](https://github.com/loorksy/newlora/actions/runs/37309204529) and [Android run 37309204535](https://github.com/loorksy/newlora/actions/runs/37309204535). Every job was rejected before execution with the same billing annotation. Remote CI is not passing.

Earlier release uploads returned HTTP 400 `Bad Content-Length`; the empty draft release was deleted. No fake GitHub Release is created and no binary is committed. Keep PR #1 Draft until the live checklist passes.
