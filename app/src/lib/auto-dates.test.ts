import { describe, expect, it } from "vitest";
import { applyAutoDates, detectDates, localDate, periodRange } from "./auto-dates";
import type { AutoDates, BillDraft } from "./types";

const d = (s: string) => new Date(`${s}T12:00:00`);
const auto = (period: AutoDates["period"], which: AutoDates["which"]): AutoDates => ({ enabled: true, period, which });

describe("periodRange", () => {
  it("quincena actual", () => {
    expect(periodRange(d("2026-03-10"), auto("quincena", "actual"))).toEqual({ start: "2026-03-01", end: "2026-03-15" });
    expect(periodRange(d("2026-03-16"), auto("quincena", "actual"))).toEqual({ start: "2026-03-16", end: "2026-03-31" });
    expect(periodRange(d("2028-02-20"), auto("quincena", "actual"))).toEqual({ start: "2028-02-16", end: "2028-02-29" });
  });

  it("quincena anterior, incluso cruzando de año", () => {
    expect(periodRange(d("2026-03-20"), auto("quincena", "anterior"))).toEqual({ start: "2026-03-01", end: "2026-03-15" });
    expect(periodRange(d("2026-03-05"), auto("quincena", "anterior"))).toEqual({ start: "2026-02-16", end: "2026-02-28" });
    expect(periodRange(d("2026-01-02"), auto("quincena", "anterior"))).toEqual({ start: "2025-12-16", end: "2025-12-31" });
  });

  it("mes actual y anterior", () => {
    expect(periodRange(d("2026-04-30"), auto("mes", "actual"))).toEqual({ start: "2026-04-01", end: "2026-04-30" });
    expect(periodRange(d("2026-01-15"), auto("mes", "anterior"))).toEqual({ start: "2025-12-01", end: "2025-12-31" });
  });
});

describe("detectDates", () => {
  const text = "Apoyo a la educación como Coordinador del 2024-03-01 al 2024-03-15";

  it("cambia las fechas por marcadores y reconoce la quincena", () => {
    expect(detectDates(text)).toEqual({
      text: "Apoyo a la educación como Coordinador del {inicio} al {fin}",
      period: "quincena",
    });
    expect(detectDates("del 2024-02-16 al 2024-02-29")?.period).toBe("quincena");
    expect(detectDates("del 2024-03-01 al 2024-03-31")?.period).toBe("mes");
    expect(detectDates("del 2024-03-03 al 2024-03-09")?.period).toBeUndefined();
    expect(detectDates("sin fechas")).toBeNull();
  });
});

describe("applyAutoDates", () => {
  const bill = {
    date: "2024-03-01",
    items: [{ description: "Coordinador del {inicio} al {fin}" }],
  } as unknown as BillDraft;

  it("resuelve la descripción con la fecha de emisión", () => {
    const result = applyAutoDates(bill, auto("quincena", "actual"), d("2026-10-03"));
    expect(result.items[0].description).toBe("Coordinador del 2026-10-01 al 2026-10-15");
    expect(result.description).toBe("Coordinador del 2026-10-01 al 2026-10-15");
    expect(result.date).toBe("2026-10-03");
  });

  it("no toca nada si están desactivadas", () => {
    expect(applyAutoDates(bill, { ...auto("quincena", "actual"), enabled: false })).toBe(bill);
  });
});

describe("localDate", () => {
  it("usa la fecha local, no UTC", () => {
    expect(localDate(new Date(2026, 9, 3, 23, 30))).toBe("2026-10-03");
  });
});
