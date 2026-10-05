# Chart workspace

KLineChart Pro 0.1.1 (Apache-2.0) with KLineChart 9.8.12 is bundled locally with Vite. No vendor demo datafeed or Polygon credential is used. `packages/chart` supplies an OANDA candle datafeed, optional indicators, deterministic drawings and an original Arabic locale. The chart's numeric axes and symbols stay LTR.

The WebView and server use the same bundle. `packages/contracts` defines loadInstrument/loadCandles/setTimeframe, drawing commands, capture and visible-range events. A single bridge handles messaging. Unknown commands are rejected. Public navigation is restricted to the configured chart origin/path; file access and mixed content are disabled.

The browser render service creates a new trusted page, loads candle/drawing state, waits for ready animation frames, and captures a high-resolution PNG. The runtime feeds those pixels to a vision-capable model. A text-only model receives an explicit capability error rather than pretending to see a chart. The model may delegate to a vision-capable research selection.

History requests filter by requested time bounds. A bounded loaded snapshot disables further local history pagination, avoiding repeated-candle artifacts. Mobile timeframe changes fetch the selected OANDA series; visible charts poll every 15 seconds. Deep historical scrolling beyond the loaded snapshot is not yet implemented. Polling should be exercised against a real OANDA account before deployment; server monitoring fetches fresh data independently of mobile visibility.

Drawings use the core chart APIs. Pro does not expose the underlying chart publicly; the adapter obtains the existing v9 instance by the documented initializer after assigning its stored chart ID to the widget element. This compatibility point is pinned and covered by a real Chromium screenshot check; reevaluate it when upgrading either chart package.

Chart state now carries OANDA `displayPrecision` as `metadata.pricePrecision`, `pipLocation`, and `volumePrecision=0` with `volumeUnit=price_updates`. These values survive chart artifacts, browser rendering and the typed WebView bridge. New account candle responses reject missing/invalid display precision. Legacy artifacts without metadata derive decimals from their stored candle values rather than assuming five digits; refresh through OANDA for authoritative precision. Bridge tests cover standard FX, JPY pairs and metals, timeframe commands, annotations, and invalid numeric/metadata payloads.
