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
export type ChartState = {
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
  return value as ChartCommand;
}
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
