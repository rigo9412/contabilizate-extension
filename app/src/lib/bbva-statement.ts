// Lee el estado de cuenta de tarjeta de crédito BBVA (PDF ya convertido a
// renglones de texto con pdf-text.ts). Solo se guardan los últimos 4 dígitos
// de la tarjeta; CLABE, domicilio y número de cliente se ignoran.
import { checkTotals, MONTHS, type StatementParseResult } from "./statement-common";
import type { CardMovement } from "./types";

const DATE = String.raw`\d{2}-[a-zA-Z]{3,4}-\d{4}`;
const MONEY = String.raw`\$\s*([\d,]+\.\d{2})`;

const MOVEMENT = new RegExp(String.raw`^(${DATE})\s+(${DATE})\s+(.+?)\s+([+-])\s*${MONEY}$`);
const FOREIGN = new RegExp(String.raw`^([A-Z]{3})\s*${MONEY}\s+TIPO DE CAMBIO\s*\$\s*([\d,]+\.\d+)$`);
const DIGITAL_CARD = /\s*;\s*Tarjeta Digital\s*\*+(\d{4})\s*$/i;

/** "04-dic-2025" → "2025-12-04". */
export function parseBbvaDate(value: string): string {
  const [day, month, year] = value.toLowerCase().split("-");
  const mm = MONTHS[month];
  if (!mm) throw new Error(`Fecha no reconocida: ${value}`);
  return `${year}-${mm}-${day}`;
}

function money(value: string): number {
  return Number(value.replace(/,/g, ""));
}

function find(text: string, pattern: RegExp): string | undefined {
  return text.match(pattern)?.[1];
}

function findMoney(text: string, pattern: RegExp): number | undefined {
  const value = find(text, pattern);
  return value === undefined ? undefined : money(value);
}

/**
 * Valor junto a una etiqueta del encabezado. En el PDF el valor puede quedar
 * medio renglón arriba o abajo de la etiqueta, así que se busca en los tres.
 */
function nearLabel(lines: string[], label: RegExp, value: RegExp): string | undefined {
  const i = lines.findIndex((l) => label.test(l));
  if (i < 0) return undefined;
  const after = lines[i].split(label)[1] ?? "";
  for (const candidate of [after, lines[i - 1], lines[i + 1]]) {
    const found = candidate?.match(value)?.[1];
    if (found) return found;
  }
  return undefined;
}

function nearMoney(lines: string[], label: RegExp): number | undefined {
  const value = nearLabel(lines, label, new RegExp(MONEY));
  return value === undefined ? undefined : money(value);
}

export function isBbvaStatement(lines: string[]): boolean {
  return lines.some((l) => /BBVA/.test(l)) && lines.some((l) => /N[úu]mero de tarjeta:/i.test(l));
}

export function parseBbvaStatement(lines: string[]): StatementParseResult {
  const text = lines.join("\n");
  const period = text.match(new RegExp(String.raw`Periodo:\s*(${DATE})\s+al\s+(${DATE})`));
  const cardNumber = find(text, /N[úu]mero de tarjeta:\s*(\d{12,19})/i);
  if (!/BBVA/.test(text) || !period || !cardNumber) {
    throw new Error("El PDF no parece un estado de cuenta de tarjeta de crédito BBVA");
  }

  const movements: CardMovement[] = [];
  let inRegular = false;
  let totalCharges: number | undefined;
  let totalPayments: number | undefined;
  for (const line of lines) {
    if (/CARGOS,\s*COMPRAS Y ABONOS REGULARES/i.test(line)) {
      inRegular = true;
      continue;
    }
    const charges = find(line, new RegExp(String.raw`TOTAL CARGOS\s*${MONEY}`));
    if (charges) totalCharges = money(charges);
    const payments = find(line, new RegExp(String.raw`TOTAL ABONOS\s*-?\s*${MONEY}`));
    if (payments) {
      totalPayments = money(payments);
      inRegular = false;
    }
    // Las compras a meses traen otras columnas; por ahora solo se leen los cargos regulares.
    if (/DIFERID/i.test(line) && /MESES/i.test(line)) inRegular = false;
    if (!inRegular) continue;

    const m = line.match(MOVEMENT);
    if (m) {
      const [, date, chargeDate, rawDescription, sign, amount] = m;
      const digital = rawDescription.match(DIGITAL_CARD);
      movements.push({
        date: parseBbvaDate(date),
        chargeDate: parseBbvaDate(chargeDate),
        description: rawDescription.replace(DIGITAL_CARD, "").trim(),
        amount: sign === "-" ? -money(amount) : money(amount),
        ...(digital && { digitalCard: digital[1] }),
      });
      continue;
    }
    const foreign = line.match(FOREIGN);
    const last = movements.at(-1);
    if (foreign && last && foreign[1] !== "MXP" && foreign[1] !== "MXN") {
      last.foreignCurrency = foreign[1];
      last.foreignAmount = money(foreign[2]);
      last.exchangeRate = money(foreign[3]);
    }
  }

  const { sumCharges, sumPayments, warnings } = checkTotals(movements, totalCharges, totalPayments);

  const due = nearLabel(lines, /Fecha l[íi]mite de pago:/i, new RegExp(`(${DATE})`));
  return {
    statement: {
      bank: "BBVA",
      cardName: find(text, /(TARJETA [A-ZÁÉÍÓÚÑ ]+?BBVA(?: \([^)]*\))?)/)?.trim() ?? "Tarjeta BBVA",
      cardLast4: cardNumber.slice(-4),
      periodStart: parseBbvaDate(period[1]),
      periodEnd: parseBbvaDate(period[2]),
      dueDate: due ? parseBbvaDate(due) : undefined,
      previousBalance: findMoney(text, new RegExp(String.raw`Adeudo del periodo anterior\s*${MONEY}`)),
      totalCharges: totalCharges ?? sumCharges,
      totalPayments: totalPayments ?? sumPayments,
      paymentNoInterest: nearMoney(lines, /Pago para no generar\s+intereses:?/i),
      minimumPayment: nearMoney(lines, /Pago m[íi]nimo:/i),
      creditLimit: findMoney(text, new RegExp(String.raw`L[íi]mite de cr[ée]dito:\s*${MONEY}`)),
      movements,
    },
    warnings,
  };
}
