export type Provider = "openai" | "anthropic" | "zai";
export type Selection = { provider: Provider; model: string };
export type Preferences = {
  language: "ar" | "en";
  main: Selection | null;
  subagent: Selection | null;
  voice: Selection | null;
};
export type Resource<T = Record<string, unknown>> = {
  id: string;
  type: string;
  version: number;
  sessionId: string | null;
  data: T;
  createdAt: string;
  updatedAt: string;
};
export type EventEnvelope = {
  id: number;
  event: string;
  version: 1;
  sessionId: string | null;
  runId: string | null;
  timestamp: string;
  payload: Record<string, unknown>;
};
export type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  complete?: boolean;
};
export type Drawing = {
  id: string;
  kind:
    | "trendline"
    | "horizontal"
    | "vertical"
    | "zone"
    | "label"
    | "marker"
    | "arrow";
  points: { timestamp?: number; value?: number }[];
  label?: string;
};
export type ChartMetadata = {
  pricePrecision: number;
  pipLocation: number | null;
  volumePrecision: number;
  volumeUnit: "price_updates";
};
export type ChartState = {
  metadata?: ChartMetadata | null;
  instrument: string;
  timeframe: string;
  candles: Candle[];
  drawings: Drawing[];
  locale: "ar" | "en";
};
export type ChartCommand =
  | { id: string; command: "loadInstrument"; payload: ChartState }
  | { id: string; command: "loadCandles"; payload: Candle[] }
  | { id: string; command: "setTimeframe"; payload: string }
  | {
      id: string;
      command:
        | "addTrendline"
        | "addHorizontalLine"
        | "addVerticalLine"
        | "addZone"
        | "addLabel"
        | "addMarker";
      payload: Drawing;
    }
  | { id: string; command: "removeDrawing"; payload: string }
  | {
      id: string;
      command: "clearAgentDrawings" | "captureChart" | "getVisibleRange";
    };
export type ChartEvent = {
  id?: string;
  event:
    | "ready"
    | "captured"
    | "visibleRange"
    | "timeframeChanged"
    | "error"
    | "updated";
  payload?: unknown;
};
export function parseChartCommand(value: unknown): ChartCommand {
  if (!value || typeof value !== "object") throw Error("invalid_bridge");
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== "string" ||
    ![
      "loadInstrument",
      "loadCandles",
      "setTimeframe",
      "addTrendline",
      "addHorizontalLine",
      "addVerticalLine",
      "addZone",
      "addLabel",
      "addMarker",
      "removeDrawing",
      "clearAgentDrawings",
      "captureChart",
      "getVisibleRange",
    ].includes(String(v.command))
  )
    throw Error("invalid_bridge");
  const payload = v.payload;
  const timeframes = new Set([
    "S5",
    "S10",
    "S15",
    "S30",
    "M1",
    "M2",
    "M4",
    "M5",
    "M10",
    "M15",
    "M30",
    "H1",
    "H2",
    "H3",
    "H4",
    "H6",
    "H8",
    "H12",
    "D",
    "W",
    "M",
  ]);
  const candlesValid = (items: unknown): boolean =>
    Array.isArray(items) &&
    items.length <= 5000 &&
    items.every(
      (c) =>
        c &&
        ["timestamp", "open", "high", "low", "close", "volume"].every(
          (k) => typeof c[k] === "number" && Number.isFinite(c[k])
        )
    );
  if (v.command === "loadCandles" && !candlesValid(payload))
    throw Error("invalid_bridge");
  if (v.command === "setTimeframe" && !timeframes.has(String(payload)))
    throw Error("invalid_bridge");
  if (v.command === "loadInstrument") {
    const state = payload as ChartState;
    if (
      !state ||
      !/^[A-Z0-9_]{3,24}$/.test(state.instrument) ||
      !timeframes.has(state.timeframe) ||
      !candlesValid(state.candles) ||
      !Array.isArray(state.drawings) ||
      state.drawings.length > 100 ||
      !["ar", "en"].includes(state.locale)
    )
      throw Error("invalid_bridge");
    const m = state.metadata;
    if (
      m &&
      (![m.pricePrecision, m.volumePrecision].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 12
      ) ||
        m.volumeUnit !== "price_updates" ||
        (m.pipLocation !== null && !Number.isInteger(m.pipLocation)))
    )
      throw Error("invalid_bridge");
    state.drawings.forEach(validateDrawing);
  }
  if (String(v.command).startsWith("add")) validateDrawing(payload);
  if (v.command === "removeDrawing" && typeof payload !== "string")
    throw Error("invalid_bridge");
  return value as ChartCommand;
}
function validateDrawing(value: unknown): void {
  const drawing = value as Drawing;
  if (
    !drawing ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(drawing.id) ||
    ![
      "trendline",
      "horizontal",
      "vertical",
      "zone",
      "label",
      "marker",
      "arrow",
    ].includes(drawing.kind) ||
    !Array.isArray(drawing.points) ||
    drawing.points.length < 1 ||
    drawing.points.length > 8 ||
    drawing.points.some(
      (p) =>
        !p ||
        !Object.values(p).every(
          (n) => typeof n === "number" && Number.isFinite(n)
        )
    ) ||
    (drawing.label !== undefined &&
      (typeof drawing.label !== "string" || drawing.label.length > 120))
  )
    throw Error("invalid_bridge");
}
export function chartPrecision(state: ChartState): {
  price: number;
  volume: number;
} {
  return {
    price:
      state.metadata?.pricePrecision ??
      Math.max(
        0,
        ...state.candles.flatMap((c) =>
          [c.open, c.high, c.low, c.close].map(
            (n) => (n.toFixed(12).replace(/0+$/, "").split(".")[1] || "").length
          )
        )
      ),
    volume: state.metadata?.volumePrecision ?? 0,
  };
}
export type ActivityEvent = {
  type: "tool_started" | "tool_completed" | "tool_failed" | string;
  tool?: string;
  code?: string;
  instrument?: string;
  entity_id?: string;
};
export type Recommendation = {
  instrument: string;
  summary: string;
  direction?: "buy" | "sell" | "neutral";
  entry?: number;
  stop?: number;
  targets: number[];
  timeframes: string[];
  status: string;
  rationale_summary?: string;
  chart_artifact_id?: string;
  monitoring_task_id?: string;
};
export type Artifact = {
  type: "sheet" | "data_table" | "chart" | "agent_text" | "select_item";
  title: string;
  data: Record<string, unknown>;
};
export type Task = {
  id: string;
  sessionId: string;
  status: string;
  config: { objective: string; instrument?: string; notification: string };
  latestCheck?: string;
  nextCheck?: string;
  latestResult?: string;
};
