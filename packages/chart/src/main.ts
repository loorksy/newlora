import { ar } from "./locales";
import { KLineChartPro, loadLocales } from "@klinecharts/pro";
import "@klinecharts/pro/dist/klinecharts-pro.css";
import { init, registerLocale, type Chart, type KLineData } from "klinecharts";
import {
  parseChartCommand,
  type ChartState,
  type ChartEvent,
  type Drawing,
} from "@newlora/contracts";

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (v: string) => void };
    newlora: { load: (state: ChartState) => Promise<void>; ready: boolean };
  }
}
loadLocales("ar", ar);
registerLocale("ar", ar);
let state: ChartState;
let pro: KLineChartPro | undefined;
let chart: Chart | null;
let subscription: ((c: KLineData) => void) | undefined;
const emit = (event: ChartEvent) =>
  window.ReactNativeWebView?.postMessage(JSON.stringify(event));
function period(tf: string) {
  const unit = tf[0];
  return {
    multiplier: Number(tf.slice(1)) || 1,
    timespan: (
      {
        S: "second",
        M: tf.length === 1 ? "month" : "minute",
        H: "hour",
        D: "day",
        W: "week",
      } as Record<string, string>
    )[unit],
    text: tf,
  };
}
const names: Record<Drawing["kind"], string> = {
  trendline: "segment",
  horizontal: "horizontalStraightLine",
  vertical: "verticalStraightLine",
  zone: "rect",
  label: "simpleAnnotation",
  marker: "simpleAnnotation",
  arrow: "arrow",
};
function draw(d: Drawing) {
  chart?.removeOverlay({ id: d.id });
  chart?.createOverlay({
    id: d.id,
    groupId: "agent",
    name: names[d.kind],
    lock: true,
    points: d.points,
    extendData: d.label || "",
    styles: {
      line: { color: "#84b69e", size: 2 },
      rect: { color: "#84b69e24", borderColor: "#84b69e" },
      text: { color: "#e6ede9" },
    },
  });
}
async function load(next: ChartState) {
  state = next;
  const symbol = {
    ticker: state.instrument,
    name: state.instrument,
    shortName: state.instrument,
    exchange: "OANDA",
    market: "forex",
    priceCurrency: "",
    type: "forex",
    pricePrecision: 5,
    volumePrecision: 0,
  };
  if (!pro) {
    pro = new KLineChartPro({
      container: "chart",
      symbol,
      period: period(state.timeframe),
      periods: ["M1", "M5", "M15", "M30", "H1", "H4", "D", "W"].map(period),
      timezone: "Etc/UTC",
      theme: "dark",
      locale: state.locale === "ar" ? "ar" : "en-US",
      watermark: "Newlora · OANDA",
      mainIndicators: [],
      subIndicators: [],
      drawingBarVisible: true,
      datafeed: {
        searchSymbols: async () => [symbol],
        getHistoryKLineData: async (_s, p, from, to) => {
          if (p.text !== state.timeframe) {
            state.timeframe = p.text;
            state.candles = [];
            emit({ event: "timeframeChanged", payload: p.text });
          }
          return state.candles.filter(
            (c) => c.timestamp >= from && c.timestamp < to
          );
        },
        subscribe: (_s, _p, callback) => {
          subscription = callback;
        },
        unsubscribe: () => {
          subscription = undefined;
        },
      },
    });
  } else {
    pro.setLocale(state.locale === "ar" ? "ar" : "en-US");
    pro.setSymbol(symbol);
    pro.setPeriod(period(state.timeframe));
  }
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
  const el = document.querySelector<HTMLElement>(".klinecharts-pro-widget");
  // Core v9 looks up existing instances by element.id; Pro stores that ID in an attribute.
  if (el) el.id = el.getAttribute("k-line-chart-id") || el.id;
  chart = el ? init(el) : null;
  if (!chart) throw Error("chart_unavailable");
  chart.applyNewData(state.candles, false);
  chart.removeOverlay({ groupId: "agent" });
  state.drawings.forEach(draw);
  window.newlora.ready = true;
  emit({ event: "updated" });
}
window.newlora = { load, ready: false };
async function receive(event: MessageEvent) {
  try {
    const c = parseChartCommand(JSON.parse(event.data));
    switch (c.command) {
      case "loadInstrument":
        await load(c.payload);
        break;
      case "loadCandles":
        state.candles = c.payload;
        chart?.applyNewData(c.payload, false);
        if (subscription && c.payload.length)
          subscription(c.payload[c.payload.length - 1]);
        break;
      case "setTimeframe":
        pro?.setPeriod(period(c.payload));
        break;
      case "clearAgentDrawings":
        chart?.removeOverlay({ groupId: "agent" });
        break;
      case "removeDrawing":
        chart?.removeOverlay({ id: c.payload });
        break;
      case "captureChart":
        emit({
          id: c.id,
          event: "captured",
          payload: chart?.getConvertPictureUrl(true, "png", "#111615"),
        });
        break;
      case "getVisibleRange":
        emit({
          id: c.id,
          event: "visibleRange",
          payload: chart?.getVisibleRange(),
        });
        break;
      default:
        draw(c.payload);
    }
  } catch {
    emit({ event: "error", payload: "invalid_chart_command" });
  }
}
window.addEventListener("message", receive);
document.addEventListener("message", receive as unknown as EventListener);
emit({ event: "ready" });
