import { describe, expect, it } from "vitest";
import { parseBbvaDate, parseBbvaStatement } from "./bbva-statement";
import { textItemsToLines } from "./pdf-text";

// Renglones tal como salen de pdf-text.ts para un estado de cuenta BBVA (datos ficticios).
const LINES = [
  "Página 1 de 7",
  "TU PAGO REQUERIDO ESTE PERIODO",
  "Periodo: 04-dic-2025 al 03-ene-2026",
  "Fecha de corte: 03-ene-2026",
  "1 viernes, 23-ene-2026",
  "Fecha límite de pago:",
  "TARJETA ORO BBVA (ORO) 2 $308.50",
  "Pago para no generar intereses:",
  "Número de tarjeta: 4000123412341234",
  "4",
  "Pago mínimo: $150.00",
  "Adeudo del periodo anterior $1,000.00 Monto de intereses pagados en los últimos 12",
  "Cargos compras a meses (capital)7 + $0.00",
  "Límite de crédito: $50,000.00",
  "CARGOS,COMPRAS Y ABONOS REGULARES(NO A MESES) Tarjeta titular: XXXXXXXXXXXX1234",
  "05-dic-2025 05-dic-2025 BMOVIL.PAGO TDC - $1,000.00",
  "Número de cuenta: XXXXXX1234 Página 3 de 7",
  "CARGOS,COMPRAS Y ABONOS REGULARES(NO A MESES) Tarjeta titular: XXXXXXXXXXXX1234",
  "IVA :$ 0.00 Interes: $ 0.00 Comisiones:$0.00 Capital:$1,000.00 Capital",
  "06-dic-2025 08-dic-2025 OXXO CENTRO + $52.00",
  "20-dic-2025 22-dic-2025 SQ *TIENDA + $398.12",
  "USD $22.00 TIPO DE CAMBIO $18.10",
  "24-dic-2025 26-dic-2025 APPLE.COM/BILL ; Tarjeta Digital ***9999 + $1,119.00",
  "MXP $1,119.00 TIPO DE CAMBIO $1.00",
  "TOTAL CARGOS $1,569.12",
  "TOTAL ABONOS -$1,000.00",
  "Bancomer BBVA",
];

describe("parseBbvaStatement", () => {
  it("lee el encabezado y los movimientos regulares", () => {
    const { statement, warnings } = parseBbvaStatement(LINES);
    expect(warnings).toEqual([]);
    expect(statement).toMatchObject({
      bank: "BBVA",
      cardName: "TARJETA ORO BBVA (ORO)",
      cardLast4: "1234",
      periodStart: "2025-12-04",
      periodEnd: "2026-01-03",
      dueDate: "2026-01-23",
      previousBalance: 1000,
      totalCharges: 1569.12,
      totalPayments: 1000,
      paymentNoInterest: 308.5,
      minimumPayment: 150,
      creditLimit: 50000,
    });
    expect(statement.movements).toEqual([
      { date: "2025-12-05", chargeDate: "2025-12-05", description: "BMOVIL.PAGO TDC", amount: -1000 },
      { date: "2025-12-06", chargeDate: "2025-12-08", description: "OXXO CENTRO", amount: 52 },
      {
        date: "2025-12-20",
        chargeDate: "2025-12-22",
        description: "SQ *TIENDA",
        amount: 398.12,
        foreignCurrency: "USD",
        foreignAmount: 22,
        exchangeRate: 18.1,
      },
      { date: "2025-12-24", chargeDate: "2025-12-26", description: "APPLE.COM/BILL", amount: 1119, digitalCard: "9999" },
    ]);
  });

  it("avisa si los totales no cuadran", () => {
    const lines = LINES.filter((l) => !l.includes("OXXO CENTRO"));
    expect(parseBbvaStatement(lines).warnings).toHaveLength(1);
  });

  it("rechaza PDFs que no son estados de cuenta BBVA", () => {
    expect(() => parseBbvaStatement(["Factura", "Total $100.00"])).toThrow(/BBVA/);
  });

  it("convierte fechas en español", () => {
    expect(parseBbvaDate("01-ene-2026")).toBe("2026-01-01");
    expect(parseBbvaDate("15-sept-2025")).toBe("2025-09-15");
  });
});

describe("textItemsToLines", () => {
  it("agrupa por renglón y ordena por posición", () => {
    const item = (str: string, x: number, y: number) => ({ str, transform: [1, 0, 0, 1, x, y] });
    const lines = textItemsToLines([
      item("+ $52.00", 500, 699),
      item("OXXO", 200, 700),
      item("06-dic-2025", 10, 700.5),
      item("Encabezado", 10, 750),
      item(" ", 10, 650),
    ]);
    expect(lines).toEqual(["Encabezado", "06-dic-2025 OXXO + $52.00"]);
  });

  it("no cuenta como gasto del mes la compra a meses completa", () => {
    const lines = LINES.flatMap((l) =>
      l.startsWith("TOTAL CARGOS")
        ? ["01-jun-2025 01-jun-2025 AMAZON A MESES A 03 MESES S/I ; Tarjeta Digital ***1090 + $900.00", "03-jun-2025 04-jun-2025 01 DE 03 AMAZON A MESES ; Tarjeta Digital ***1090 + $300.00", "TOTAL CARGOS $2,769.12"]
        : [l],
    );
    const { statement, warnings } = parseBbvaStatement(lines);
    const msi = statement.movements.filter((m) => /A MESES/.test(m.description));
    expect(msi.map((m) => [m.description, m.amount])).toEqual([["01 DE 03 AMAZON A MESES", 300]]);
    expect(statement.totalCharges).toBe(2769.12);
    expect(warnings).toEqual(["Compra a meses omitida (se cuenta por mensualidad): AMAZON A MESES A 03 MESES S/I $900"]);
  });
});
