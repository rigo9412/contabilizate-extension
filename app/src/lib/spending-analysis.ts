// Análisis de los gastos de tarjeta: categorías, gastos hormiga, cargos
// recurrentes, patrones por día y recomendaciones de ahorro. Cada estado de
// cuenta cuenta como un periodo (≈ un mes), así los promedios no dependen de
// meses calendario incompletos. Con varias tarjetas, los estados de cuenta
// del mismo mes (según dónde cae la mitad de su periodo) forman un solo periodo.
import { round2 } from "./bill-calc";
import type { CategorySlice } from "./dashboard";
import type { CardMovement, CardStatement } from "./types";

/** Compras chicas que se repiten y pasan desapercibidas. */
export const HORMIGA_MAX = 150;

interface CategoryRule {
  key: string;
  name: string;
  pattern: RegExp;
}

// El orden importa: gana la primera regla que coincide.
export const CATEGORY_RULES: CategoryRule[] = [
  { key: "pagos", name: "Pagos a la tarjeta", pattern: /PAGO TDC|PAGO TARJETA|PAGO A TU TARJETA|SU PAGO/ },
  {
    key: "suscripciones",
    name: "Suscripciones digitales",
    pattern: /APPLE\.COM|ITUNES|NETFLIX|SPOTIFY|GITHUB|GOOGLE \*|YOUTUBE|DISNEY|HBO|\bMAX\b|PRIME VIDEO|AMAZON PRIME|PARAMOUNT|CRUNCHYROLL|OPENAI|CHATGPT|ANTHROPIC|CLAUDE\.AI|MICROSOFT|XBOX|PLAYSTATION|STEAM|ADOBE|CANVA|DROPBOX|ICLOUD|VIX|STAR\+/,
  },
  { key: "delivery", name: "Comida a domicilio", pattern: /RAPPI|UBER ?EATS|DIDI ?FOOD|DIDIFOOD|SIN DELANTAL|PEDIDOSYA/ },
  {
    key: "comida",
    name: "Restaurantes y comida rápida",
    pattern: /BURGER|MC ?DONALD|CHURCH|APPLEBEE|KFC|DOMINO|PIZZA|LITTLE CAESAR|SUBWAY|CARL'?S|WINGS|SUSHI|TACO|TAQ|REST\b|RESTAUR|DOPI|VIPS|SANBORNS|TOKS|CAFE|STARBUCKS|COFFEE|CINEPOLIS|CINEMEX/,
  },
  { key: "transporte", name: "Gasolina y transporte", pattern: /^GAS\b(?! NATURAL)|GASOLIN|PEMEX|SHELL|MOBIL\b|\bBP\b|OXXO GAS|G500|GULF|\bARCO\b|UBER(?! ?EATS)|DIDI(?! ?FOOD)|CABIFY|CASETA|PEAJE|ESTACIONAMIENTO|AUTOZONE|REFACCION/ },
  { key: "conveniencia", name: "Tiendas de conveniencia", pattern: /OXXO|7 ?ELEVEN|SEVEN ELEVEN|CIRCULO K|CIRCLE K|EXTRA\b|KIOSKO|ALSUPER/ },
  { key: "super", name: "Supermercado", pattern: /WAL ?MART|WALMART|SORIANA|H ?E ?B\b|CHEDRAUI|BODEGA AURRERA|AURRERA|COSTCO|SAMS|SAM'S|LA COMER|CITY MARKET|SUPERAMA|CASA LEY|CALIMAX|S-MART|\bSMART\b(?! ?FIT)|BODEGA|CARNEMART|CENTRAL DE CARNES|CARNICER/ },
  { key: "linea", name: "Compras en línea", pattern: /AMAZON|MERCADO ?LIBRE|SHEIN|TEMU|ALIEXPRESS|LIVERPOOL\.COM|EBAY/ },
  { key: "farmacia", name: "Farmacia y salud", pattern: /FARM|FAR GUAD|BENAVIDES|SIMILARES|SAN PABLO|DEL AHORRO|HOSPITAL|MEDIC|DENT|LABORATORIO/ },
  { key: "servicios", name: "Telefonía y servicios", pattern: /TELCEL|AT ?& ?T|\bATT\b|MOVISTAR|TELMEX|IZZI|TOTALPLAY|MEGACABLE|TELEFONIA|CFE|NATURGY|\bAGUA\b|GAS NATURAL|INTERNET/ },
  { key: "hogar", name: "Hogar", pattern: /HOME DEPOT|LOWES|COPPEL|ELEKTRA|IKEA|SODIMAC|TRUPER|FERRETER/ },
  { key: "ropa", name: "Ropa y calzado", pattern: /SHOE|ZAPAT|LIVERPOOL|SUBURBIA|PALACIO|ZARA|H&M|C&A|NIKE|ADIDAS|PRICE SHOES|INNOVASPORT|MARTI\b|SEARS/ },
  { key: "personal", name: "Cuidado personal", pattern: /BARBER|ESTETICA|SALON|SPA\b|GYM|SMART ?FIT|SPORTS WORLD/ },
];

const NOT_HORMIGA = ["comida", "delivery", "suscripciones", "linea", "servicios", "farmacia", "transporte", "hogar"];

export const OTHER_CATEGORY = { key: "otros", name: "Otros" };

// Categorías que imprime el banco (Nu) → categoría del análisis.
const BANK_CATEGORIES: Record<string, string> = {
  supermercado: "super",
  restaurantes: "comida",
  comida: "comida",
  transporte: "transporte",
  salud: "farmacia",
  servicios: "servicios",
  hogar: "hogar",
  ropa: "ropa",
  belleza: "personal",
  "cuidado personal": "personal",
  "compras en línea": "linea",
  suscripciones: "suscripciones",
};

/** Por nombre del comercio; si no lo reconoce, usa la categoría del banco. */
export function categorize(description: string, bankCategory?: string): { key: string; name: string } {
  const text = description.toUpperCase();
  const byRule = CATEGORY_RULES.find((r) => r.pattern.test(text));
  if (byRule) return byRule;
  const key = bankCategory && BANK_CATEGORIES[bankCategory.toLowerCase()];
  return CATEGORY_RULES.find((r) => r.key === key) ?? OTHER_CATEGORY;
}

/** Nombre del comercio sin números de sucursal: "OXXO FRONTERA 12" → "OXXO FRONTERA". */
export function merchantKey(description: string): string {
  return description.toUpperCase().replace(/\d+/g, "").replace(/\s+/g, " ").trim();
}

interface Expense extends CardMovement {
  /** 0 = último periodo, 1 = el anterior… */
  periodIndex: number;
  category: { key: string; name: string };
  merchant: string;
}

export interface CategoryStat extends CategorySlice {
  /** Promedio por periodo. */
  perPeriod: number;
  share: number;
  /** Gasto del último periodo contra el promedio de los anteriores (solo con 2+ periodos). */
  last?: number;
  previousAverage?: number;
}

export interface RecurringCharge {
  merchant: string;
  category: string;
  /** Monto típico por periodo. */
  amount: number;
  periods: number;
  subscription: boolean;
}

export interface FrequentMerchant {
  merchant: string;
  count: number;
  total: number;
  average: number;
}

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
  /** Ahorro estimado por periodo (≈ mes). */
  monthlySaving: number;
  /** El ahorro es un máximo (p. ej. cancelar todas las suscripciones), no entra en el total. */
  upTo?: boolean;
}

export interface SpendingAnalysis {
  periods: number;
  totalSpent: number;
  perPeriod: number;
  categories: CategoryStat[];
  hormiga: { count: number; total: number; perPeriod: number; topMerchants: FrequentMerchant[] };
  recurring: RecurringCharge[];
  frequent: FrequentMerchant[];
  /** Gasto por día de la semana, lunes primero. */
  byWeekday: { label: string; total: number; count: number }[];
  weekendShare: number;
  recommendations: Recommendation[];
  /** Suma de los ahorros estimados (sin los "hasta"). */
  potentialSaving: number;
}

export const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

function sum(values: number[]): number {
  return round2(values.reduce((a, v) => a + v, 0));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function money(value: number): string {
  return value.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

function frequentMerchants(expenses: Expense[]): FrequentMerchant[] {
  return [...groupBy(expenses, (e) => e.merchant)]
    .map(([merchant, list]) => {
      const total = sum(list.map((e) => e.amount));
      return { merchant, count: list.length, total, average: round2(total / list.length) };
    })
    .sort((a, b) => b.count - a.count || b.total - a.total);
}

/** Tarjeta de un estado de cuenta: banco + últimos 4 dígitos. */
export function cardKey(statement: Pick<CardStatement, "bank" | "cardLast4">): string {
  return `${statement.bank}-${statement.cardLast4}`;
}

/**
 * Mes al que corresponde un estado de cuenta ("2025-12"): donde cae la mitad
 * de su periodo. Así un BBVA del 4-dic al 3-ene y un Nu del 25-nov al 25-dic
 * cuentan como diciembre.
 */
export function statementMonth(statement: Pick<CardStatement, "periodStart" | "periodEnd">): string {
  const start = new Date(`${statement.periodStart}T12:00:00Z`).getTime();
  const end = new Date(`${statement.periodEnd}T12:00:00Z`).getTime();
  return new Date((start + end) / 2).toISOString().slice(0, 7);
}

/** Periodo de cada estado de cuenta: 0 = el mes más reciente con datos, 1 = el anterior… */
function periodIndexes(statements: CardStatement[]): Map<string, number> {
  const months = [...new Set(statements.map(statementMonth))].sort().reverse();
  return new Map(statements.map((s) => [s.id, months.indexOf(statementMonth(s))]));
}

/**
 * Categoría del banco por comercio, para los movimientos que no la traen (el
 * formato nuevo de Nu ya no la imprime pero el anterior sí).
 */
function learnedBankCategories(statements: CardStatement[]): Map<string, string> {
  const learned = new Map<string, string>();
  for (const s of statements) {
    for (const m of s.movements) if (m.bankCategory) learned.set(merchantKey(m.description), m.bankCategory);
  }
  return learned;
}

/** Categoría aprendida del comercio, también si el nombre trae algo extra ("MTA NVO REFORMA SERV D"). */
function learnedCategory(learned: Map<string, string>, merchant: string): string | undefined {
  if (learned.has(merchant)) return learned.get(merchant);
  for (const [known, category] of learned) {
    if (known.length >= 6 && merchant.startsWith(`${known} `)) return category;
  }
  return undefined;
}

/**
 * Analiza los cargos (no los pagos) de los estados de cuenta dados. `history`
 * son todos los estados de cuenta, de donde se aprenden las categorías del banco.
 */
export function analyzeSpending(statements: CardStatement[], history: CardStatement[] = statements): SpendingAnalysis {
  const learned = learnedBankCategories(history);
  const periodIndex = periodIndexes(statements);
  const periodCount = Math.max(0, ...periodIndex.values()) + (statements.length ? 1 : 0);
  const periods = Math.max(1, periodCount);
  const expenses: Expense[] = statements.flatMap((s) =>
    s.movements
      .filter((m) => m.amount > 0)
      .map((m) => {
        const merchant = merchantKey(m.description);
        const category = categorize(m.description, m.bankCategory ?? learnedCategory(learned, merchant));
        return { ...m, periodIndex: periodIndex.get(s.id)!, category, merchant };
      })
      .filter((e) => e.category.key !== "pagos"),
  );
  const totalSpent = sum(expenses.map((e) => e.amount));
  const perPeriod = round2(totalSpent / periods);

  // Categorías, con la comparación del último periodo contra el promedio de los anteriores.
  const categories: CategoryStat[] = [...groupBy(expenses, (e) => e.category.key)]
    .map(([key, list]) => {
      const total = sum(list.map((e) => e.amount));
      const stat: CategoryStat = {
        key,
        name: list[0].category.name,
        total,
        count: list.length,
        perPeriod: round2(total / periods),
        share: totalSpent ? total / totalSpent : 0,
      };
      if (periodCount >= 2) {
        stat.last = sum(list.filter((e) => e.periodIndex === 0).map((e) => e.amount));
        stat.previousAverage = round2((total - stat.last) / (periodCount - 1));
      }
      return stat;
    })
    .sort((a, b) => b.total - a.total);
  const perCategory = (key: string) => categories.find((c) => c.key === key)?.perPeriod ?? 0;

  // Gastos hormiga: compras chicas y prescindibles. Comida, suscripciones y compras en línea tienen su
  // propia recomendación; servicios, salud, transporte y hogar son necesidades.
  const hormigaList = expenses.filter((e) => e.amount <= HORMIGA_MAX && !NOT_HORMIGA.includes(e.category.key));
  const hormigaTotal = sum(hormigaList.map((e) => e.amount));
  const hormiga = {
    count: hormigaList.length,
    total: hormigaTotal,
    perPeriod: round2(hormigaTotal / periods),
    topMerchants: frequentMerchants(hormigaList).slice(0, 3),
  };

  // Recurrentes: el mismo comercio en la mayoría de los periodos con montos parecidos, o una suscripción conocida.
  const recurring: RecurringCharge[] = [];
  for (const [merchant, list] of groupBy(expenses, (e) => e.merchant)) {
    const byPeriod = [...groupBy(list, (e) => String(e.periodIndex)).values()].map((l) => sum(l.map((e) => e.amount)));
    const subscription = list[0].category.key === "suscripciones";
    const steady =
      periodCount >= 2 &&
      byPeriod.length >= Math.max(2, Math.ceil(periodCount * 0.6)) &&
      Math.max(...byPeriod) <= Math.min(...byPeriod) * 1.25;
    if (!subscription && !steady) continue;
    recurring.push({
      merchant,
      category: list[0].category.name,
      amount: round2(median(byPeriod)),
      periods: byPeriod.length,
      subscription,
    });
  }
  recurring.sort((a, b) => b.amount - a.amount);

  const byWeekday = WEEKDAYS.map((label) => ({ label, total: 0, count: 0 }));
  for (const e of expenses) {
    const day = byWeekday[weekday(e.date)];
    day.total = round2(day.total + e.amount);
    day.count++;
  }
  const weekendShare = totalSpent ? (byWeekday[5].total + byWeekday[6].total) / totalSpent : 0;

  const recommendations: Recommendation[] = [];
  if (hormiga.perPeriod >= 300) {
    const where = hormiga.topMerchants.map((m) => `${m.merchant} (${m.count} ${m.count === 1 ? "vez" : "veces"})`).join(", ");
    const saving = round2(hormiga.perPeriod * 0.5);
    recommendations.push({
      id: "hormiga",
      title: "Reduce los gastos hormiga",
      detail: `Haces unas ${Math.round(hormiga.count / periods)} compras de menos de ${money(HORMIGA_MAX)} por mes que suman ${money(hormiga.perPeriod)}, sobre todo en ${where}. Si las reduces a la mitad ahorras ${money(saving)} al mes, ${money(saving * 12)} al año.`,
      monthlySaving: saving,
    });
  }
  const delivery = perCategory("delivery");
  if (delivery >= 200) {
    recommendations.push({
      id: "delivery",
      title: "Pide menos comida a domicilio",
      detail: `Gastas ${money(delivery)} al mes en apps de comida. Entre envío, servicio y propina pagas cerca de 30% más que en el local; cocinar o recoger tú mismo la mitad de esos pedidos te ahorra lo estimado.`,
      monthlySaving: round2(delivery * 0.4),
    });
  }
  const eatingOut = perCategory("comida");
  if (eatingOut >= 500) {
    recommendations.push({
      id: "comida",
      title: "Ponle tope a comer fuera",
      detail: `Restaurantes y comida rápida suman ${money(eatingOut)} al mes. Fija un presupuesto semanal de ${money((eatingOut * 0.7) / 4.3)} y lleva comida algunos días: bajarlo 30% te ahorra lo estimado.`,
      monthlySaving: round2(eatingOut * 0.3),
    });
  }
  const online = perCategory("linea");
  if (online >= 500 && online / perPeriod >= 0.15) {
    recommendations.push({
      id: "linea",
      title: "Aplica la regla de las 24 horas en compras en línea",
      detail: `Las compras en línea son ${Math.round((online / perPeriod) * 100)}% de tu gasto (${money(online)} al mes). Deja los artículos en el carrito un día antes de pagar y quita la tarjeta guardada; evitar una de cada cuatro compras te ahorra lo estimado.`,
      monthlySaving: round2(online * 0.25),
    });
  }
  const subscriptions = recurring.filter((r) => r.subscription);
  if (subscriptions.length > 0) {
    const total = sum(subscriptions.map((s) => s.amount));
    recommendations.push({
      id: "suscripciones",
      title: "Revisa tus suscripciones",
      detail: `Pagas ${money(total)} al mes en ${subscriptions.map((s) => s.merchant.replace(/\.$/, "")).join(", ")}. Cancela las que no usaste en el último mes o cámbialas a plan anual o familiar.`,
      monthlySaving: total,
      upTo: true,
    });
  }
  const covered = new Set(recommendations.map((r) => r.id));
  for (const c of categories) {
    if (covered.has(c.key) || c.key === "otros" || c.last === undefined || !c.previousAverage) continue;
    const increase = c.last - c.previousAverage;
    if (increase >= 300 && c.last >= c.previousAverage * 1.3) {
      recommendations.push({
        id: `sube-${c.key}`,
        title: `Tu gasto en ${c.name.toLowerCase()} subió`,
        detail: `El último periodo gastaste ${money(c.last)}, ${Math.round((c.last / c.previousAverage - 1) * 100)}% más que tu promedio de ${money(c.previousAverage)}. Volver a tu promedio te ahorra lo estimado.`,
        monthlySaving: round2(increase),
      });
    }
  }
  if (weekendShare >= 0.45 && totalSpent > 0) {
    recommendations.push({
      id: "fin-de-semana",
      title: "Planea tus fines de semana",
      detail: `${Math.round(weekendShare * 100)}% de tu gasto es en sábado y domingo. Decide antes del viernes cuánto vas a gastar en salidas y paga en efectivo o con débito para no pasarte.`,
      monthlySaving: 0,
    });
  }
  recommendations.sort((a, b) => b.monthlySaving - a.monthlySaving);

  return {
    periods: periodCount,
    totalSpent,
    perPeriod,
    categories,
    hormiga,
    recurring,
    frequent: frequentMerchants(expenses).filter((m) => m.count >= 3).slice(0, 6),
    byWeekday,
    weekendShare,
    recommendations,
    potentialSaving: sum(recommendations.filter((r) => !r.upTo).map((r) => r.monthlySaving)),
  };
}

/** Rebanadas para la gráfica de pastel: las `max` mayores y el resto en "Otros". */
export function categorySlices(categories: CategoryStat[], max = 6): CategorySlice[] {
  if (categories.length <= max) return categories;
  const rest = categories.slice(max);
  return [
    ...categories.slice(0, max),
    {
      key: "__otros",
      name: `Otras (${rest.length})`,
      total: sum(rest.map((c) => c.total)),
      count: rest.reduce((a, c) => a + c.count, 0),
    },
  ];
}
