// Lee el estado de cuenta de la tarjeta de crédito Nu, en sus dos formatos:
// - v1 (Nu México Financiera): fechas sin año ("27 NOV") y cada compra trae
//   antes del comercio la categoría que le asigna Nu ("Supermercado Mta Nvo Reforma").
// - v2 (Nubank, desde 2026): formato regulatorio parecido al de BBVA, con fecha
//   de operación y de cargo con año, y el RFC del comercio en cada movimiento.
// Solo se guardan los últimos 4 dígitos de la tarjeta; el número de cuenta,
// la CLABE y el domicilio se ignoran.
import { checkTotals, MONTHS, parseMoney, type StatementParseResult } from "./statement-common";
import type { CardMovement } from "./types";

const DATE = String.raw`(\d{1,2}) ([A-Za-z]{3,4})\.? (\d{4})`;
const MONEY = String.raw`\$\s*[\d,]+(?:\.\d{2})?`;
const MOVEMENT = new RegExp(String.raw`^(\d{1,2}) ([A-Za-z]{3,4})\.? (.+?) (-\s*)?(${MONEY})$`);

// Categorías de Nu, de la más larga a la más corta para que "Compras en línea" gane a "Compras".
const NU_CATEGORIES = [
  "¡Muchas gracias!",
  "Cuidado personal",
  "Compras en línea",
  "Entretenimiento",
  "Supermercado",
  "Restaurantes",
  "Suscripciones",
  "Transferencias",
  "Electrónicos",
  "Transporte",
  "Tecnología",
  "Educación",
  "Servicios",
  "Mascotas",
  "Gobierno",
  "Compras",
  "Belleza",
  "Viajes",
  "Retiros",
  "Comida",
  "Hogar",
  "Salud",
  "Ropa",
  "Otros",
];

/** Fecha sin año ("27 NOV"): se toma el año del corte, o el anterior si caería después del corte. */
export function nuDate(day: string, month: string, periodEnd: string): string {
  const mm = MONTHS[month.toLowerCase()];
  if (!mm) throw new Error(`Fecha no reconocida: ${day} ${month}`);
  const year = Number(periodEnd.slice(0, 4));
  const date = `${year}-${mm}-${day.padStart(2, "0")}`;
  return date > periodEnd ? `${year - 1}-${mm}-${day.padStart(2, "0")}` : date;
}

function fullDate(match: RegExpMatchArray, offset = 1): string {
  const [day, month, year] = [match[offset], match[offset + 1], match[offset + 2]];
  const mm = MONTHS[month.toLowerCase()];
  if (!mm) throw new Error(`Fecha no reconocida: ${match[0]}`);
  return `${year}-${mm}-${day.padStart(2, "0")}`;
}

function findMoney(lines: string[], label: RegExp): number | undefined {
  for (const line of lines) {
    const m = line.match(label);
    if (m) {
      const value = line.slice((m.index ?? 0) + m[0].length).match(new RegExp(`^\\s*(-)?\\s*(${MONEY})`));
      if (value) return parseMoney(value[2]);
    }
  }
  return undefined;
}

export function isNuStatement(lines: string[]): boolean {
  return (
    lines.some((l) => /Nu M[ée]xico Financiera|Nubank|nu\.com\.mx/i.test(l)) &&
    lines.some((l) => /^TARJETA:|N[úu]mero de tarjeta:/i.test(l))
  );
}

export function parseNuStatement(lines: string[]): StatementParseResult {
  return lines.some((l) => /^CARGOS, ABONOS Y COMPRAS REGULARES/i.test(l)) ? parseNuV2(lines) : parseNuV1(lines);
}

function parseNuV1(lines: string[]): StatementParseResult {
  const text = lines.join("\n");
  const period = text.match(new RegExp(`Periodo:\\s*${DATE}\\s*-\\s*${DATE}`, "i"));
  const card = text.match(/TARJETA:\s*\d{4}[\s•*]+(\d{4})/i);
  if (!period || !card) throw new Error("El PDF no parece un estado de cuenta de tarjeta de crédito Nu");
  const periodStart = fullDate(period, 1);
  const periodEnd = fullDate(period, 4);

  const movements: CardMovement[] = [];
  let inTransactions = false;
  for (const line of lines) {
    if (/^TRANSACCIONES DE /i.test(line)) {
      inTransactions = true;
      continue;
    }
    if (/^Saldo final del periodo/i.test(line)) inTransactions = false;
    if (!inTransactions) continue;
    const m = line.match(MOVEMENT);
    if (!m) continue;
    const [, day, month, rest, minus, amount] = m;
    const category = NU_CATEGORIES.find((c) => rest.startsWith(`${c} `));
    const date = nuDate(day, month, periodEnd);
    movements.push({
      date,
      chargeDate: date,
      description: category ? rest.slice(category.length).trim() : rest,
      amount: minus ? -parseMoney(amount) : parseMoney(amount),
      ...(category && category !== "¡Muchas gracias!" && { bankCategory: category }),
    });
  }

  // "Compras" y "Pagos a tu tarjeta" del resumen; las devoluciones también son abonos.
  const purchases = findMoney(lines, /^Compras(?= \$)/);
  const payments = findMoney(lines, /^Pagos a tu tarjeta en el periodo/i);
  const refunds = findMoney(lines, /^Abonos y devoluciones/i) ?? 0;
  const totalPayments = payments === undefined ? undefined : payments + refunds;
  const { sumCharges, sumPayments, warnings } = checkTotals(movements, purchases, totalPayments);

  const due = text.match(new RegExp(`Fecha l[íi]mite de pago:\\s*${DATE}`, "i"));
  return {
    statement: {
      bank: "Nu",
      cardName: "Tarjeta de crédito Nu",
      cardLast4: card[1],
      periodStart,
      periodEnd,
      dueDate: due ? fullDate(due, 1) : undefined,
      previousBalance: findMoney(lines, /^Saldo inicial del periodo(?: \([^)]*\))?/i),
      totalCharges: purchases ?? sumCharges,
      totalPayments: totalPayments ?? sumPayments,
      paymentNoInterest: findMoney(lines, /Pago para no generar intereses:/i),
      minimumPayment: findMoney(lines, /Pago m[íi]nimo requerido:/i),
      creditLimit: findMoney(lines, /L[íi]mite de cr[ée]dito/i),
      movements,
    },
    warnings,
  };
}

const DATE_V2 = String.raw`\d{2} [A-Za-z]{3,4} \d{4}`;
const MOVEMENT_V2 = new RegExp(
  String.raw`^(${DATE_V2}) (${DATE_V2}) (.+?)(?: \| RFC: (\S+))? ([+-])\s*(${MONEY})$`,
);

/** "25 AGO 2026" → "2026-08-25". */
function dateV2(value: string): string {
  return fullDate(value.match(new RegExp(DATE))!, 1);
}

/** Primer monto después de la etiqueta, aunque quede en el renglón siguiente. */
function moneyAfter(text: string, label: string): number | undefined {
  const m = text.match(new RegExp(`${label}\\s*[:=]?\\s*[+=]?\\s*(${MONEY})`, "i"));
  return m ? parseMoney(m[1]) : undefined;
}

function parseNuV2(lines: string[]): StatementParseResult {
  const text = lines.join("\n");
  const cutoff = text.match(new RegExp(`Fecha de corte:\\s*(${DATE_V2})`, "i"));
  const card = text.match(/N[úu]mero de tarjeta:\s*[X*\d]{4}[-\s][X*\d]{4}[-\s][X*\d]{4}[-\s](\d{4})/i);
  if (!cutoff || !card) throw new Error("El PDF no parece un estado de cuenta de tarjeta de crédito Nu");
  const periodEnd = dateV2(cutoff[1]);

  // El periodo se parte en varios renglones junto al domicilio; si no se encuentra, sale de los días del periodo.
  let periodStart: string | undefined;
  const start = text.match(new RegExp(`(${DATE_V2}) al \\d{2} [A-Za-z]{3,4}`));
  if (start) periodStart = dateV2(start[1]);
  const days = text.match(/N[úu]mero de d[íi]as en el periodo:\s*(\d+)/i);
  if (!periodStart && days) {
    const end = new Date(`${periodEnd}T12:00:00`);
    end.setDate(end.getDate() - Number(days[1]) + 1);
    periodStart = end.toISOString().slice(0, 10);
  }

  const movements: CardMovement[] = [];
  let inRegular = false;
  let totalCharges: number | undefined;
  let totalPayments: number | undefined;
  for (const line of lines) {
    if (/^CARGOS, ABONOS Y COMPRAS REGULARES/i.test(line)) {
      inRegular = true;
      continue;
    }
    const charges = line.match(new RegExp(`^Total de cargos\\s*\\+?\\s*(${MONEY})`, "i"));
    if (charges) totalCharges = parseMoney(charges[1]);
    const payments = line.match(new RegExp(`^Total de abonos\\s*-?\\s*(${MONEY})`, "i"));
    if (payments) {
      totalPayments = parseMoney(payments[1]);
      inRegular = false;
    }
    // Las compras a meses traen otras columnas; por ahora solo se leen los cargos regulares.
    if (/DIFERID/i.test(line) && /MESES/i.test(line) && !/REGULARES/i.test(line)) inRegular = false;
    if (!inRegular) continue;
    const m = line.match(MOVEMENT_V2);
    if (!m) continue;
    const [, date, chargeDate, description, rfc, sign, amount] = m;
    movements.push({
      date: dateV2(date),
      chargeDate: dateV2(chargeDate),
      description: description.trim(),
      amount: sign === "-" ? -parseMoney(amount) : parseMoney(amount),
      ...(rfc && rfc !== "S.I." && { merchantRfc: rfc }),
    });
  }
  const { sumCharges, sumPayments, warnings } = checkTotals(movements, totalCharges, totalPayments);

  const due = text.match(new RegExp(`Fecha l[íi]mite de pago\\s*:[^\\d\\n]*(${DATE_V2})`, "i"));
  return {
    statement: {
      bank: "Nu",
      cardName: text.match(/Producto:\s*(Tarjeta de Cr[ée]dito Nu[^\n]*)/i)?.[1].trim() ?? "Tarjeta de crédito Nu",
      cardLast4: card[1],
      periodStart: periodStart ?? periodEnd,
      periodEnd,
      dueDate: due ? dateV2(due[1]) : undefined,
      previousBalance: moneyAfter(text, "Adeudo del periodo anterior"),
      totalCharges: totalCharges ?? sumCharges,
      totalPayments: totalPayments ?? sumPayments,
      paymentNoInterest: moneyAfter(text, "Pago para no generar intereses"),
      minimumPayment: moneyAfter(text, "Pago m[íi]nimo"),
      creditLimit: moneyAfter(text, "L[íi]mite de cr[ée]dito"),
      movements,
    },
    warnings,
  };
}
