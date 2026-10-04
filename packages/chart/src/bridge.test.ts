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
