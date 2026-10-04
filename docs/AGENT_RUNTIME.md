# Agent runtime

`services/api/newlora/runtime.py` owns one readable tool loop. A structured routing call produces `Intent`; it does not prescribe a strategy. Context includes current UTC time, recent original messages, a compacted checkpoint and durable user facts. The selected official SDK returns public text and tool calls. Each validated tool emits real start/completion activity; rendered PNGs enter the next multimodal input, never event payloads.

Tools are in `agent_tools.py`. There is no shell, eval, file editor, coding workspace or execution/order tool. Browsing and search work independently of model provider. Instrument lists come from the connected account. Models may select any supported OANDA timeframe; default tool values are defaults for omitted parameters, not a mandatory analysis pipeline.

The worker loads persisted runs. Each mutation checks the current lease fencing token inside its transaction. A repeated tool with the same run and normalized arguments returns the recorded effect. External read-only research calls may repeat after process failure. Public final messages have stable run-derived IDs. Events are durable and replayed by increasing cursor.

Streaming accepts only native public text deltas. Native reasoning events are ignored; an incremental guard also suppresses reasoning tags across chunk boundaries. Public activity contracts contain only known action types and bounded metadata. Usage contains no text or tool arguments.

Infrastructure bounds: provider timeout, maximum loop iterations, subagent concurrency and task polling minimum protect the VPS. They do not gate a trading signal, define risk, mandate a stop or change the user's analysis strategy.
