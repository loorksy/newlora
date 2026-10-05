# Memory and cross-conversation retrieval

PostgreSQL owns three distinct layers: original messages, checkpoint summaries, and versioned canonical preferences. Original history is never deleted by compaction. Recent messages and the latest checkpoint remain the normal context; old conversations are not indiscriminately injected.

## Retrieval

`memory_search` accepts `query`, optional `instrument`, `since`/`until` (aware timestamps), `resource_types`, and `limit` (1–30). It searches owner-scoped `search_documents`, using PostgreSQL `simple` full-text tokenization, `websearch_to_tsquery`, ranking, and a GIN expression index. Structured instrument/type/time/owner indexes narrow candidates. SQLite uses escaped lexical matching for local tests. No embeddings, external vector service, provider lock-in, or embedding cost is introduced.

Documents contain a safe bounded summary, resource type/ID, source conversation, original timestamp, instrument, and structured reference back to the resource. Indexed material includes checkpoint summaries, assistant-authored analyses, recommendations and their before/after revisions, monitoring outcomes, chart/report metadata, subagent conclusions, canonical preferences and preference revisions. Candles, image bytes, provider reasoning, credential records, and arbitrary raw JSON fields are excluded from the retrieval projection. Private chain-of-thought is never a source.

SQLAlchemy transaction hooks maintain the index alongside the source write. A scheduler maintenance pass backfills up to 50 missing resources and 50 analyses per iteration, including existing installations after migration. IDs are deterministic, so rebuilding/restarting does not duplicate documents. Current resource updates replace their projection; recommendation revisions and task outcomes retain historical projections. Use `recommendation_revision` for change history and `analysis` for previous theses.

Retrieval is lexical plus structured metadata, not an embedding similarity promise. The model can reformulate or translate search terms, use a canonical instrument symbol, and perform several searches. For “compare gold with two weeks ago,” it should search XAU_USD with a date range, retrieve original references, then obtain new OANDA data separately. Historical records must not be represented as live prices.

## Consolidation

Compaction retains twelve recent messages once the configured context budget is exceeded and preserves every original message. Three unprocessed checkpoints make a session eligible for consolidation. Completion of a chat may process these immediately; the scheduler also queues a durable `purpose=memory` run independently of the phone. The normal worker lease, session serialization, token metering, and run fence apply. A unique checkpoint/date queue key prevents repeated scheduler iterations from adding duplicate work; failed provider calls can retry on a later day.

Automatic canonical promotion is deliberately narrow: explicit language, report format, and report detail preferences. Proposals must quote an actual user message; inferred identity, transient prices, and unsupported conclusions remain outside canonical user facts. Other research remains discoverable in the retrieval index. Recognizable credentials are rejected from fact writes and redacted from search summaries. This is defense in depth, not permission to submit credentials in chat: Settings is the only intended credential entry path.

Stable owner/key IDs, row locks, expected versions, and revision records prevent silent concurrent overwrites. Identical updates are no-ops. A conflict leaves checkpoints eligible for retry. Model output never bypasses these checks. User corrections are represented as explicit revisions rather than appending a giant transcript to memory.

## Deletion and recovery

Deleting a conversation requires its active runs to stop. It removes linked history, tasks, recommendations/revisions, artifacts, attachments, journal/checkpoint state, notification outbox records, and retrieval projections. Canonical facts/revisions sourced from that conversation's checkpoints are removed too; independently sourced facts remain. Stored files are removed after the database deletion commits. Encrypted PostgreSQL and artifact-volume backups must follow the same retention policy.

The index can be rebuilt from durable source rows. PostgreSQL is authoritative; Redis loss does not remove memory. Files, database and application master key must all be backed up. Tests cover cross-chat/date/instrument/history retrieval, explicit preference corrections, secret exclusion, concurrent revision conflicts, maintenance restart behavior and deletion cleanup.
