# Memory

Three independent layers live in PostgreSQL:

1. `messages`: immutable original user/public-assistant conversation history.
2. `records(kind=checkpoint)`: public factual summary with the last covered message ID, leaving the newest 12 messages intact.
3. `records(kind=memory)`: canonical USER / AGENT / MEMORY facts, with before/after records in `memory_revision`.

Compaction triggers only after the configured context message limit, before admitting the next full turn. It commits summary and cursor together and never deletes originals. Context combines the latest checkpoint with messages after its cursor and durable facts. Session serialization prevents concurrent foreground compaction from advancing a cursor out of order.

After three unconsolidated checkpoints, a consolidation call proposes a small set of durable facts. Its prompt excludes credentials, transient prices and speculation, and permits contradiction replacement only for explicit corrections. Fact revisions use optional optimistic version checks. This is the independent SQL equivalent of the useful Consolidator/Dream concepts; there is no per-message full-memory rewrite or Git worktree.

Conversation deletion removes its checkpoint records but keeps separately managed user memory. Inspect memory through `/resources/memory` and revision history through `/resources/memory_revision`. Memory extraction remains model-based and requires human acceptance testing for contradictory preferences; do not treat model inference as verified identity.
