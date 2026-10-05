# Scoped research agents

The lead model chooses whether to call `delegate` and supplies objective strings, scoped context and allowed tool names. No fixed specialist roles or fixed agent count run on every turn. A configurable semaphore bounds simultaneous research for VPS stability.

Research agents use the configured research model, falling back to the main selection. Their allowlist is intersected with read/research tools. They cannot recursively delegate, create monitoring, update recommendations or execute trades. A chart render can create a chart artifact as a research output. Findings, parent run identity, model and allowlist are persisted, and the lead receives structured objective/findings records before synthesizing a response.

Parent cancellation/fencing applies to all research tool effects. Individual failures return an explicit failed finding, never a fabricated result. Research provider calls are attributed separately in the usage ledger. An interrupted lead run can repeat research after restart; only durable effects are idempotent.
