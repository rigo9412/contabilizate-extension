import { describe, expect, it } from "vitest";
import { nuDate, parseNuStatement } from "./nu-statement";
import { categorize } from "./spending-analysis";
import { parseStatement } from "./statement-parser";

// Renglones tal como salen de pdf-text.ts para un estado de cuenta Nu (datos ficticios).
const LINES = [
  "Periodo: 25 NOV 2025 - 25 DIC 2025 (31 días)",
  "Fecha de corte: 25 DIC 2025",
  "Fecha límite de pago: 05 ENE 2026",
  "Pago para no generar intereses: $1,250",
  "Pago mínimo requerido: $150.50",
  "TARJETA: 5555 •••• •••• 1234",
  "USO DE TU TARJETA DE CRÉDITO Límite de crédito $3,000",
  "Compras, retiros y mensualidades del periodo $0",
  "Saldo inicial del periodo (NOV 2025) $100.00",
  "Pagos a tu tarjeta en el periodo - $600.00",
  "Compras $1,350.00",
  "Abonos y devoluciones $50.00",
  "TRANSACCIONES DE 25 NOV 2025 A 25 DIC 2025 (31 DÍAS) MONTOS EN PESOS MEXICANOS",
  "27 NOV ¡Muchas gracias! Pago a tu tarjeta de crédito - $600.00",
  "28 NOV Supermercado Tienda Centro $1,000.00",
  "06 DIC Compras en línea Tienda Web $300.00",
  "12 DIC Restaurantes Taqueria El Paso $50",
  "13 DIC Devolución Tienda Web - $50.00",
  "Saldo final del periodo $800.00",
  "3 de 5",
  "En Nu México Financiera, S. A. de C. V., Sociedad Financiera",
];

describe("parseNuStatement", () => {
  it("lee el encabezado, los movimientos y separa la categoría de Nu", () => {
    const { statement, warnings } = parseNuStatement(LINES);
    expect(warnings).toEqual([]);
    expect(statement).toMatchObject({
      bank: "Nu",
      cardLast4: "1234",
      periodStart: "2025-11-25",
      periodEnd: "2025-12-25",
      dueDate: "2026-01-05",
      previousBalance: 100,
      totalCharges: 1350,
      totalPayments: 650,
      paymentNoInterest: 1250,
      minimumPayment: 150.5,
      creditLimit: 3000,
    });
    expect(statement.movements).toEqual([
      { date: "2025-11-27", chargeDate: "2025-11-27", description: "Pago a tu tarjeta de crédito", amount: -600 },
      { date: "2025-11-28", chargeDate: "2025-11-28", description: "Tienda Centro", amount: 1000, bankCategory: "Supermercado" },
      { date: "2025-12-06", chargeDate: "2025-12-06", description: "Tienda Web", amount: 300, bankCategory: "Compras en línea" },
      { date: "2025-12-12", chargeDate: "2025-12-12", description: "Taqueria El Paso", amount: 50, bankCategory: "Restaurantes" },
      { date: "2025-12-13", chargeDate: "2025-12-13", description: "Devolución Tienda Web", amount: -50 },
    ]);
  });

  it("detecta el banco automáticamente", () => {
    expect(parseStatement(LINES).statement.bank).toBe("Nu");
    expect(() => parseStatement(["Otro banco", "Total $10.00"])).toThrow(/BBVA y Nu/);
  });

  it("pone el año según la fecha de corte", () => {
    expect(nuDate("28", "DIC", "2026-01-25")).toBe("2025-12-28");
    expect(nuDate("3", "ENE", "2026-01-25")).toBe("2026-01-03");
  });

  it("usa la categoría de Nu cuando el comercio no se reconoce", () => {
    expect(categorize("Tienda Centro", "Supermercado").key).toBe("super");
    expect(categorize("OXXO Centro", "Supermercado").key).toBe("conveniencia");
    expect(categorize("Tienda Centro").key).toBe("otros");
  });
});

// Formato nuevo (Nubank, 2026), tal como sale de pdf-text.ts (datos ficticios).
const V2 = [
  "¡Hola, Ana! Página 1 de 7",
  "CALLE 1 26 AGO 2026 al 24 SEP",
  "Periodo:",
  "COL CENTRO 2026",
  "88000 Fecha de corte: 24 SEP 2026",
  "Número de días en el periodo: 30 días",
  "Fecha límite de pago : Lunes, 05 OCT 2026",
  "Producto: Tarjeta de Crédito Nu, Oro",
  "Pago para no generar intereses :",
  "$1,437.54",
  "Número de tarjeta: XXXX-XXXX-XXXX-1234",
  "Pago mínimo + compras y",
  "3 $0.00",
  "Pago mínimo : $10.00",
  "Adeudo del periodo anterior = $63.40 Monto de intereses pagados en los",
  "Límite de crédito $28,000.00",
  "CARGOS, ABONOS Y COMPRAS REGULARES (NO A MESES)",
  "Fecha de la",
  "Fecha de cargo Descripción del movimiento Monto",
  "25 AGO 2026 26 AGO 2026 Tienda Centro | RFC: S.I. +$121.50",
  "29 AGO 2026 29 AGO 2026 ¡Gracias por tu pago! | RFC: S.I. -$63.40",
  "Abono (con cuenta Nu)",
  "Página 5 de 7",
  "CARGOS, ABONOS Y COMPRAS REGULARES (NO A MESES)",
  "01 SEP 2026 03 SEP 2026 Gas Centro | RFC: GCE010101AB1 +$1,176.00",
  "Total de cargos +$1,297.50",
  "Total de abonos -$63.40",
  "Nubank, S.A. Institución de Banca Múltiple",
];

describe("parseNuStatement v2", () => {
  it("lee el formato nuevo de Nubank", () => {
    const { statement, warnings } = parseStatement(V2);
    expect(warnings).toEqual([]);
    expect(statement).toMatchObject({
      bank: "Nu",
      cardName: "Tarjeta de Crédito Nu, Oro",
      cardLast4: "1234",
      periodStart: "2026-08-26",
      periodEnd: "2026-09-24",
      dueDate: "2026-10-05",
      previousBalance: 63.4,
      totalCharges: 1297.5,
      totalPayments: 63.4,
      paymentNoInterest: 1437.54,
      minimumPayment: 10,
      creditLimit: 28000,
    });
    expect(statement.movements).toEqual([
      { date: "2026-08-25", chargeDate: "2026-08-26", description: "Tienda Centro", amount: 121.5 },
      { date: "2026-08-29", chargeDate: "2026-08-29", description: "¡Gracias por tu pago!", amount: -63.4 },
      { date: "2026-09-01", chargeDate: "2026-09-03", description: "Gas Centro", amount: 1176, merchantRfc: "GCE010101AB1" },
    ]);
  });

  it("calcula el inicio del periodo con los días si no viene la fecha", () => {
    const lines = V2.filter((l) => !l.includes(" al 24 SEP"));
    expect(parseNuStatement(lines).statement.periodStart).toBe("2026-08-26");
  });
});

