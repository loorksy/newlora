# Artifacts and recommendations

Resources use `{id,type,version,sessionId,data,createdAt,updatedAt}`. An artifact's data contains its artifact subtype, title and subtype data. Supported subtypes: `sheet`, `data_table`, `chart`, `agent_text`, `select_item`. All persist in PostgreSQL and reload with the conversation. Chart PNGs reside in the persistent artifact volume, accessed only through an authenticated ownership-checked endpoint.

Tables/sheets contain `columns` and `rows`; mobile supports filtering and column sorting. Reports contain `text`. Selections contain `{id,label}` options. Selection validates the submitted ID server-side and queues a structured interaction in its conversation, not merely a local state change. Charts include OANDA candles, drawings, instrument/timeframe, retrieval timestamp and an image reference.

Recommendation entities are separate from chat messages. Their optional entry, stop, targets, timeframe and thesis fields render only if provided. No confidence score, success rate or risk/reward is invented. Update records retain a public before/after timeline; recommendations can link a monitoring task and chart artifact. API resource detail exposes the timeline and linked IDs.
