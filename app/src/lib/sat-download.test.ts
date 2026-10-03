import { describe, expect, it } from "vitest";
import { monthsBetween } from "./sat-download";

describe("monthsBetween", () => {
  it("incluye ambos extremos y cruza de año", () => {
    expect(monthsBetween("2025-11-15", "2026-02-03")).toEqual([
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
    expect(monthsBetween("2026-03-01", "2026-03-31")).toEqual([{ year: 2026, month: 3 }]);
  });
});
