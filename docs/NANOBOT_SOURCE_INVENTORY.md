# Nanobot source inventory

Inspected 2026-10-04, upstream https://github.com/HKUDS/nanobot at `96ad7b4dbf617b11e0991e92c7d295dbd828a956`. LICENSE is MIT, copyright 2025-present Xubin Ren and the nanobot contributors. Upstream checkout is outside Newlora and is inspection-only.

| Files inspected | Useful concept | Newlora decision |
|---|---|---|
| agent/memory.py, agent/autocompact.py | separate immediate history, summary checkpoint, durable facts; do not rewrite each turn | Independent transactional checkpoints and revisioned facts in PostgreSQL |
| agent/context.py, agent/context_governance.py | bounded model-facing context without mutating public history | Independent recent-message window plus checkpoint, tool output bounds |
| templates/agent/dream.md, templates/memory/ | consolidate compacted history into canonical current facts, explicit corrections | Independent consolidation prompt and auditable revisions; no copied prompt |
| utils/gitstore.py | traceable durable memory edits, cursor separate from content | Database revisions replace per-user Git repositories |
| session/manager.py, history.py, recovery.py, automation_turns.py | durable original messages, scoped session identity, interrupted work recovery | SQL rows, serialized conversation admission and leased runs |
| agent/subagent.py, turn_hooks.py, progress_hook.py, model_runtime.py | dynamic scoped tasks, cancellation, immutable model choice, action events | Small own runtime, allowlisted tools and concurrency limits; never reasoning events |
| agent/automation_turns.py, cron/service.py, cron/types.py, triggers/local_runner.py | durable schedules, occurrence identity, session-bound background turns | SQL occurrences/outbox with leases and fencing |
| llm_usage/models.py, llm_usage/store.py | content-free per-call usage, attribution, unknown-cost handling | PostgreSQL usage ledger, separately versioned pricing |
| security/network.py | DNS resolution validation, redirect checks, DNS pinning | Own public-only outbound proxy for Chromium, tested IP validation |
| security/workspace_access.py, security/workspace_policy.py | capability and path boundaries, application checks are not OS isolation | No filesystem tool; separate browser container, UUID artifact paths |
| webui/session_identity.py, session_projection.py (interfaces) | public session projection independent of runtime | Own REST resource and replayable event API |

No nanobot source files or code fragments are copied or adapted. Concepts above are implemented independently. Thus no source modifications to upstream exist. CLI, channels, coding tools, skills, MCP registry, shell, filesystem tools, developer workspaces, tmux and upstream provider layer are not used. LICENSE is retained under `docs/licenses/` as provenance, not a runtime dependency.
