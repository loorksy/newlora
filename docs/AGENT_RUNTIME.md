# Agent runtime

`services/api/newlora/runtime.py` owns one readable tool loop. A structured routing call produces `Intent`; it does not prescribe a strategy. Context includes current UTC time, recent original messages, a compacted checkpoint and durable user facts. The selected official SDK returns public text and tool calls. Each validated tool emits real start/completion activity; rendered PNGs enter the next multimodal input, never event payloads.

Tools are in `agent_tools.py`. There is no shell, eval, file editor, coding workspace or execution/order tool. Browsing and search work independently of model provider. Instrument lists come from the connected account. Models may select any supported OANDA timeframe; default tool values are defaults for omitted parameters, not a mandatory analysis pipeline.

The worker loads persisted runs. Each mutation checks the current lease fencing token inside its transaction. A repeated mutation returns its committed operation result according to the logical identity described below. External read-only research calls may repeat after process failure. Public final messages have stable run-derived IDs. Events are durable and replayed by increasing cursor.

Streaming accepts only native public text deltas. Native reasoning events are ignored; an incremental guard also suppresses reasoning tags across chunk boundaries. Public activity contracts contain only known action types and bounded metadata. Usage contains no text or tool arguments.

Infrastructure bounds: provider timeout, maximum loop iterations, subagent concurrency and task polling minimum protect the VPS. They do not gate a trading signal, define risk, mandate a stop or change the user's analysis strategy.

## Durable execution and mutation journal (schema 0002)

The main loop persists an encrypted checkpoint after each public assistant turn and each tool result. It contains public messages/tool calls, model-visible image data and a step cursor; no private reasoning fields are included. A final answer is checkpointed before chat delivery. Replacement workers load this state, finish pending tool calls, and replay committed results before asking the model for another turn. Intent routing and compaction are not repeated when a runtime checkpoint exists.

Every state-changing recommendation/task/artifact/outcome tool first writes an `operations` plan in a separate fenced transaction. Planned arguments are encrypted. Execution acquires the current run fence, then commits the resource mutation, result, audit events, notification outbox and `committed` journal state atomically. A crash before commit leaves a plan; a crash after commit returns the existing result. `executing` is a transaction-local transition, so a rolled-back transaction does not leave a falsely committed operation. Conditional fence writes acquire a lock on both PostgreSQL and SQLite. Expired, replaced or cancelled workers cannot commit resources or events.

Creation identity uses run + tool + structured subject (instrument or linked recommendation), independent of summary wording. A recommendation or monitoring task for the same subject in one user request is reused; creating another independently requires a new user request. This conservative boundary prevents nondeterministic duplicate creation, but does not provide arbitrary multiple scenarios for one instrument within one run. Updates, task actions and general artifacts additionally use the persisted tool-call slot so legitimate successive revisions/artifacts are not collapsed. Monitoring outcomes are unique per monitoring run. Existing pre-journal Effect entries and creation audit events are imported when encountered during upgrades.

External provider calls may still be repeated if the process dies before saving their result. Usage attempts are written before network I/O; unresolved attempts remain unknown/failed, not invented zero-token successes. Research-only subagents may rerun after a parent crashes. External delivery is not claimed to be exactly once.

## Attachments and activity

Authenticated uploads are linked to a conversation and then claimed by a message. Images enter the official adapters as inline validated PNG inputs; PDF/text/CSV enter bounded, explicitly untrusted reference context. No private file path is sent to a provider. Selecting a non-vision model for images produces a public capability error. A durable runtime checkpoint preserves the current multimodal turn across worker replacement.

Tool events distinguish `tool_started`, `tool_completed`, and `tool_failed`. Failures contain public error codes only. Raw exceptions, model reasoning and tool arguments are excluded from the activity stream. Mobile displays the translated failure state. User runs remain on the VPS after disconnect, and successful chat completion creates a deduplicated normal notification outbox entry.
