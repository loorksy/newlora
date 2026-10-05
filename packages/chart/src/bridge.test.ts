import { describe, it, expect } from "vitest";
import { parseChartCommand } from "@newlora/contracts";
describe("chart bridge boundary", () => {
  it("rejects unrecognized commands", () => {
    expect(() => parseChartCommand({ id: "1", command: "eval" })).toThrow();
  });
  it("accepts typed capture and drawing commands", () => {
    expect(
      parseChartCommand({ id: "1", command: "captureChart" }).command
    ).toBe("captureChart");
  });
});

import { chartPrecision, type ChartState } from "@newlora/contracts";
const state: ChartState = {
  instrument: "USD_JPY",
  timeframe: "M15",
  locale: "ar",
  drawings: [],
  candles: [
    {
      timestamp: 1,
      open: 150.123,
      high: 151,
      low: 149,
      close: 150.12,
      volume: 40,
    },
  ],
  metadata: {
    pricePrecision: 3,
    pipLocation: -2,
    volumePrecision: 0,
    volumeUnit: "price_updates",
  },
};
it.each([
  ["USD_JPY", 3],
  ["EUR_USD", 5],
  ["XAU_USD", 3],
  ["XPT_USD", 2],
])("preserves account metadata for %s", (instrument, price) => {
  const chart = {
    ...state,
    instrument: String(instrument),
    metadata: { ...state.metadata!, pricePrecision: Number(price) },
  };
  expect(
    parseChartCommand({ id: "load", command: "loadInstrument", payload: chart })
      .command
  ).toBe("loadInstrument");
  expect(chartPrecision(chart)).toEqual({ price, volume: 0 });
});
it("infers only for legacy artifacts without metadata", () =>
  expect(chartPrecision({ ...state, metadata: null }).price).toBe(3));
it.each(["H4", "M5", "D"])("accepts supported timeframe %s", (timeframe) =>
  expect(
    parseChartCommand({ id: "tf", command: "setTimeframe", payload: timeframe })
      .command
  ).toBe("setTimeframe")
);
it.each([
  { id: "x", command: "setTimeframe", payload: "bad" },
  { id: "x", command: "loadCandles", payload: [{ close: NaN }] },
  {
    id: "x",
    command: "loadInstrument",
    payload: { ...state, metadata: { ...state.metadata, pricePrecision: -1 } },
  },
  {
    id: "x",
    command: "addZone",
    payload: { id: "z", kind: "zone", points: [{ value: Infinity }] },
  },
])("rejects malformed payload %j", (command) =>
  expect(() => parseChartCommand(command)).toThrow("invalid_bridge")
);
it("accepts deterministic annotations", () =>
  expect(
    parseChartCommand({
      id: "draw",
      command: "addZone",
      payload: {
        id: "z",
        kind: "zone",
        points: [
          { timestamp: 1, value: 150 },
          { timestamp: 2, value: 151 },
        ],
        label: "Research zone",
      },
    }).command
  ).toBe("addZone"));
