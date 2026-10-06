// Scrape y llenado de la declaración mensual de RESICO en el portal de
// Declaraciones del SAT. Lee lo que el SAT prellenó, escribe los valores que el
// usuario autorizó y se detiene antes de "Enviar": el envío lo hace el usuario.
// Flujo y mapeo de campos: docs/declaracion-resico.md.
import { round2 } from "./bill-calc";
import { delay, LOGIN_TIMEOUT_MS, removePageStatus, run, showPageStatus } from "./sat-tab";
import type { IsrResico, IvaResico, PortalValues, ResicoActivity } from "./types";

export const DECLARATION_URL = "https://ptscdecprov.clouda.sat.gob.mx/";

export type Obligation = "isr" | "iva";

export interface PortalField {
  key: string;
  obligation: Obligation;
  /** Etiquetas posibles en el portal; se comparan sin acentos ni mayúsculas. */
  labels: string[];
}

export const PORTAL_FIELDS: PortalField[] = [
  { key: "isr.ingresos", obligation: "isr", labels: ["total de ingresos percibidos", "ingresos percibidos"] },
  { key: "isr.tasa", obligation: "isr", labels: ["tasa aplicable"] },
  { key: "isr.impuesto", obligation: "isr", labels: ["isr determinado", "impuesto mensual"] },
  { key: "isr.retenido", obligation: "isr", labels: ["isr retenido por personas morales", "isr retenido", "impuesto retenido"] },
  { key: "isr.aCargo", obligation: "isr", labels: ["isr a cargo", "impuesto a cargo"] },
  { key: "iva.gravados16", obligation: "iva", labels: ["actividades gravadas a la tasa del 16%"] },
  { key: "iva.gravados8", obligation: "iva", labels: ["actividades gravadas a la tasa del 8%"] },
  { key: "iva.gravados0", obligation: "iva", labels: ["actividades gravadas a la tasa del 0%"] },
  { key: "iva.exentos", obligation: "iva", labels: ["actividades exentas"] },
  { key: "iva.noObjeto", obligation: "iva", labels: ["actividades no objeto"] },
  { key: "iva.trasladado", obligation: "iva", labels: ["iva trasladado", "total de iva trasladado", "iva a cargo a la tasa del 16%"] },
  { key: "iva.retenido", obligation: "iva", labels: ["iva retenido"] },
  { key: "iva.acreditable", obligation: "iva", labels: ["iva acreditable del periodo", "iva acreditable"] },
  {
    key: "iva.saldoAnterior",
    obligation: "iva",
    labels: ["acreditamiento de saldos a favor de periodos anteriores", "saldo a favor de periodos anteriores"],
  },
  { key: "iva.resultado", obligation: "iva", labels: ["impuesto a cargo", "cantidad a cargo", "saldo a favor"] },
];

export const FIELD_LABELS: Record<string, string> = {
  "isr.ingresos": "Ingresos cobrados (sin IVA)",
  "isr.tasa": "Tasa de ISR",
  "isr.impuesto": "ISR del mes",
  "isr.retenido": "ISR que te retuvieron",
  "isr.aCargo": "ISR a pagar",
  "iva.gravados16": "Cobrado con IVA 16%",
  "iva.gravados8": "Cobrado con IVA 8%",
  "iva.gravados0": "Cobrado con IVA 0%",
  "iva.exentos": "Cobrado exento de IVA",
  "iva.noObjeto": "Cobrado no objeto de IVA",
  "iva.trasladado": "IVA que cobraste",
  "iva.retenido": "IVA que te retuvieron",
  "iva.acreditable": "IVA de tus gastos",
  "iva.saldoAnterior": "Saldo a favor aplicado",
  "iva.resultado": "IVA a pagar (o a favor)",
};

/** Valores de la app con las claves del portal. La tasa va en porcentaje, como la muestra el SAT. */
export function portalValues(isr: IsrResico, iva: IvaResico): PortalValues {
  return {
    "isr.ingresos": isr.income,
    "isr.tasa": round2(isr.rate * 100),
    "isr.impuesto": isr.tax,
    "isr.retenido": isr.retained,
    "isr.aCargo": isr.due,
    "iva.gravados16": iva.taxed16,
    "iva.gravados8": iva.taxed8,
    "iva.gravados0": iva.taxed0,
    "iva.exentos": iva.exempt,
    "iva.noObjeto": iva.notObject,
    "iva.trasladado": iva.translated,
    "iva.retenido": iva.retained,
    "iva.acreditable": iva.creditable,
    "iva.saldoAnterior": iva.previousBalance,
    // El portal muestra el saldo a favor como positivo en su propio renglón.
    "iva.resultado": Math.abs(iva.result),
  };
}

export interface FieldDiff {
  key: string;
  label: string;
  sat: number | null;
  ours: number;
  diff: number | null;
}

/** Compara lo prellenado contra lo calculado; `null` = el campo no se encontró en el portal. */
export function compareValues(sat: PortalValues, ours: PortalValues): FieldDiff[] {
  return PORTAL_FIELDS.map(({ key }) => {
    const s = sat[key] ?? null;
    const o = ours[key] ?? 0;
    return { key, label: FIELD_LABELS[key] ?? key, sat: s, ours: o, diff: s === null ? null : round2(o - s) };
  });
}

/** Pesos en texto del portal ("$ 1,234.50", "1234.5") a número. */
export function parseAmount(text: string | null | undefined): number | null {
  if (!text) return null;
  const clean = text.replace(/[$\s,%]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return null;
  return Number(clean);
}

export interface Acuse {
  operationNumber?: string;
  captureLine?: string;
  amountDue?: number;
  captureLineDueDate?: string;
}

/** Lee el acuse de recibo a partir del texto visible de la página. */
export function parseAcuse(text: string): Acuse | null {
  if (!/acuse de recibo|n[uú]mero de operaci[oó]n/i.test(text)) return null;
  const flat = text.replace(/\s+/g, " ");
  const operationNumber = flat.match(/n[uú]mero de operaci[oó]n:?\s*(\d{6,})/i)?.[1];
  // El SAT la agrupa con espacios ("0426 0ABC 1234…"); cada grupo lleva al menos un dígito.
  const afterLabel = flat.slice(Math.max(0, flat.search(/l[ií]nea de captura/i))).replace(/^l[ií]nea de captura/i, "");
  const captureLine = afterLabel.match(/^:?\s*((?:(?=[0-9A-Z]*\d)[0-9A-Z]{2,} ?)+)/)?.[1].replace(/ /g, "");
  const amount = flat.match(/(?:importe (?:total )?a pagar|total a pagar|cantidad a pagar):?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1];
  const due = flat.match(/(?:vigente hasta|fecha de vigencia|pagar antes del?):?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1];
  return {
    ...(operationNumber && { operationNumber }),
    ...(captureLine && captureLine.length >= 20 && { captureLine }),
    ...(amount && { amountDue: Number(amount.replace(/,/g, "")) }),
    ...(due && { captureLineDueDate: due.split("/").reverse().join("-") }),
  };
}

// ── Plan de llenado (puro) ──

/** Texto de la opción del portal para cada tipo de ingreso al clasificar el total. */
const ACTIVITY_OPTION: Record<ResicoActivity, string[]> = {
  empresarial: ["actividad empresarial"],
  honorarios: ["honorarios", "servicios profesionales"],
  arrendamiento: ["uso o goce temporal", "arrendamiento"],
  agricola: ["agricola", "ganader"],
};

/** El portal captura pesos enteros: menos de 50 centavos baja, 50 o más sube. */
export const pesos = (value: number) => Math.round(value);

export interface FillPlan {
  isr: {
    /** Ingreso total cobrado, para clasificarlo por tipo en "Total de ingresos percibidos". */
    income: number;
    /** Lo que falta sumar al prellenado ("Ingresos no considerados en el prellenado"). */
    incomeToAdd: number;
    /** Lo que sobra en el prellenado; no hay renglón seguro para restarlo, se pide a mano. */
    incomeToRemove: number;
    activityOptions: string[];
    /** Diferencia de ISR retenido contra lo que el SAT ve en facturas emitidas. */
    retainedToAdd: number;
  };
  iva: {
    /** Campos que se escriben directo en el formulario. */
    direct: { key: string; labels: string[]; value: number }[];
    /** Se captura con el botón "Capturar" (no viene prellenado). */
    creditable: number;
  };
}

const labelsOf = (key: string) => PORTAL_FIELDS.find((f) => f.key === key)!.labels;

/**
 * Qué capturar en el portal. Como en el tutorial del contador: no se confía en
 * el prellenado; se suma la diferencia para llegar a lo cobrado de verdad.
 */
export function buildFillPlan(prefill: PortalValues, ours: PortalValues, activity: ResicoActivity = "empresarial"): FillPlan {
  const income = pesos(ours["isr.ingresos"] ?? 0);
  const incomeDiff = income - pesos(prefill["isr.ingresos"] ?? 0);
  const retainedDiff = pesos(ours["isr.retenido"] ?? 0) - pesos(prefill["isr.retenido"] ?? 0);
  const directKeys = ["iva.gravados16", "iva.gravados8", "iva.gravados0", "iva.exentos", "iva.noObjeto", "iva.retenido", "iva.saldoAnterior"];
  return {
    isr: {
      income,
      incomeToAdd: Math.max(0, incomeDiff),
      incomeToRemove: Math.max(0, -incomeDiff),
      activityOptions: ACTIVITY_OPTION[activity],
      retainedToAdd: retainedDiff,
    },
    iva: {
      direct: directKeys
        .map((key) => ({ key, labels: labelsOf(key), value: pesos(ours[key] ?? 0) }))
        // Los renglones en cero que el SAT tampoco trae no se tocan (muchos no existen para todos).
        .filter((f) => f.value !== 0 || (prefill[f.key] ?? 0) !== 0),
      creditable: pesos(ours["iva.acreditable"] ?? 0),
    },
  };
}

// ── Función que se inyecta en el portal (no puede usar nada de fuera) ──

type AgentAction =
  | { type: "hasText"; texts: string[] }
  | { type: "selectInitial"; year: number; month: number }
  | { type: "next" }
  | { type: "selectObligations" }
  | { type: "openObligation"; obligation: Obligation }
  | { type: "tab"; name: string }
  | { type: "read"; fields: { key: string; labels: string[] }[] }
  | { type: "write"; fields: { key: string; labels: string[]; value: number }[] }
  | { type: "answerNo"; questions: string[] }
  | { type: "isrCapture"; plan: FillPlan["isr"] }
  | { type: "ivaCreditable"; value: number }
  | { type: "admin" }
  | { type: "text" }
  | { type: "acuseLink" }
  | { type: "banner"; text: string };

/**
 * Todo lo que se hace dentro del portal. Busca por texto visible en vez de ids
 * porque el portal los regenera; si algo no aparece lo regresa como pendiente y
 * la app lo muestra para captura manual en vez de fallar.
 */
async function portalAgent(action: AgentAction): Promise<unknown> {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const visible = (el: Element) => (el as HTMLElement).offsetParent !== null;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const CONTROLS = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), select';
  const CLICKABLE = "button, a, [role=button], input[type=button], input[type=submit], li";

  /** La ventana emergente abierta encima, si hay; si no, la página. */
  const scopeRoot = (): ParentNode => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], .modal.in, .modal.show, .ui-dialog, .modal[style*="block"]')).filter(visible);
    return dialogs.at(-1) ?? document;
  };

  /** Elementos cuyo texto propio (sin hijos) contiene la etiqueta. */
  const byOwnText = (label: string, root: ParentNode = document) => {
    const target = norm(label);
    return Array.from(root.querySelectorAll("label, span, td, th, div, p, a, button, li, strong, b, h1, h2, h3, h4, h5, legend"))
      .filter(visible)
      .filter((el) => {
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? "")
          .join(" ");
        return norm(own).includes(target);
      });
  };

  /** Busca hacia arriba (hasta 5 niveles) desde la etiqueta algo que cumpla `selector`. */
  const near = <T extends Element>(labels: string[], selector: string, root: ParentNode = document, accept: (el: T) => boolean = () => true) => {
    for (const label of labels) {
      for (const el of byOwnText(label, root)) {
        const forId = el.getAttribute("for");
        const direct = forId ? document.getElementById(forId) : null;
        if (direct?.matches(selector)) return direct as unknown as T;
        let scope: Element | null = el;
        for (let i = 0; i < 5 && scope; i++, scope = scope.parentElement) {
          const found = Array.from(scope.querySelectorAll<T>(selector)).find((c) => visible(c) && accept(c));
          if (found) return found;
        }
      }
    }
    return null;
  };

  const fieldFor = (labels: string[], root: ParentNode = document) => near<HTMLInputElement | HTMLSelectElement>(labels, CONTROLS, root);

  const textOf = (el: Element) => norm((el as HTMLElement).innerText || (el as HTMLInputElement).value || el.getAttribute("title") || "");

  /** Botón cerca de una etiqueta cuyo texto es uno de `texts` (Capturar, Agregar, Ver detalle…). */
  const buttonNear = (labels: string[], texts: string[]) =>
    near<HTMLElement>(labels, CLICKABLE, document, (b) => texts.some((t) => textOf(b).includes(norm(t))));

  const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
    el.focus();
    // Asignar con el setter nativo para que los frameworks del portal noten el cambio.
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    for (const type of ["input", "change", "blur"]) el.dispatchEvent(new Event(type, { bubbles: true }));
  };

  const chooseOption = (select: HTMLSelectElement, wanted: string[]) => {
    const option = Array.from(select.options).find((o) => wanted.some((w) => norm(o.text) === norm(w) || norm(o.text).includes(norm(w))));
    if (!option) return false;
    setValue(select, option.value);
    return true;
  };

  const selectByText = (labels: string[], wanted: string) => {
    const select = fieldFor(labels);
    return select instanceof HTMLSelectElement && chooseOption(select, [wanted]);
  };

  const clickText = (texts: string[], root: ParentNode = document) => {
    const target = Array.from(root.querySelectorAll<HTMLElement>(CLICKABLE))
      .filter(visible)
      .find((b) => texts.some((t) => textOf(b) === norm(t)));
    target?.click();
    return !!target;
  };

  /** Contesta "No" a una pregunta (radio o select) junto a su texto. */
  const answerNo = (question: string) => {
    const radio = near<HTMLInputElement>([question], 'input[type="radio"]', document, (r) => {
      const label = r.labels?.[0]?.innerText ?? r.parentElement?.innerText ?? r.value;
      return norm(label) === "no" || norm(r.value) === "no" || r.value === "0" || r.value === "false";
    });
    if (radio) {
      if (!radio.checked) radio.click();
      return true;
    }
    const select = near<HTMLSelectElement>([question], "select");
    return !!select && chooseOption(select, ["no"]);
  };

  /**
   * En la ventana de un renglón: Agregar → elegir concepto → importe → Guardar → Cerrar.
   * Es como el portal pide desglosar ingresos y descuentos.
   */
  const addInDialog = async (concept: string[], amount: number) => {
    await wait(1200);
    let root = scopeRoot();
    if (clickText(["agregar"], root)) {
      await wait(1000);
      root = scopeRoot();
    }
    const select = Array.from(root.querySelectorAll<HTMLSelectElement>("select")).find(visible);
    if (concept.length && !(select && chooseOption(select, concept))) return false;
    await wait(500);
    const input = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="text"], input[type="number"], input:not([type])')).find(
      (i) => visible(i) && !i.readOnly && !i.disabled,
    );
    if (!input) return false;
    setValue(input, String(amount));
    await wait(400);
    clickText(["guardar", "aceptar"], root);
    await wait(1000);
    clickText(["cerrar"], scopeRoot());
    await wait(800);
    return true;
  };

  const amount = (text: string) => {
    const clean = text.replace(/[$\s,%]/g, "");
    return /^-?\d+(\.\d+)?$/.test(clean) ? Number(clean) : null;
  };

  /** Fila de una obligación por su texto, sin confundirla con las de retenciones. */
  const obligationRow = (obligation: Obligation) => {
    const rows = Array.from(document.querySelectorAll("tr, li, label, .row, div")).filter(visible);
    const text = (el: Element) => norm((el as HTMLElement).innerText ?? "");
    const isIsr = (t: string) => (t.includes("isr") || t.includes("impuesto sobre la renta")) && t.includes("simplificado de confianza");
    const isIva = (t: string) => (t.includes("iva") || t.includes("valor agregado")) && !t.includes("isr") && !t.includes("impuesto sobre la renta");
    // La fila más chica que cumpla: evita tomar el contenedor de toda la lista.
    return rows
      .filter((r) => {
        const t = text(r);
        return t.length < 200 && !t.includes("retenc") && (obligation === "isr" ? isIsr(t) : isIva(t));
      })
      .sort((a, b) => text(a).length - text(b).length)[0];
  };

  switch (action.type) {
    case "hasText": {
      const body = norm(document.body?.innerText ?? "");
      return action.texts.some((t) => body.includes(norm(t)));
    }
    case "selectInitial":
      return [
        selectByText(["ejercicio"], String(action.year)),
        selectByText(["periodicidad"], "mensual"),
        selectByText(["periodo"], MONTHS[action.month - 1]),
        selectByText(["tipo de declaracion"], "normal"),
      ];
    case "next":
      return clickText(["siguiente", "continuar"]);
    case "selectObligations":
      return (["isr", "iva"] as const).map((o) => {
        const box = obligationRow(o)?.querySelector<HTMLInputElement>('input[type="checkbox"]');
        if (!box) return false;
        if (!box.checked) box.click();
        return true;
      });
    case "openObligation": {
      const row = obligationRow(action.obligation);
      const target = row?.querySelector<HTMLElement>(CLICKABLE) ?? (row as HTMLElement | undefined);
      target?.click();
      return !!target;
    }
    case "tab":
      return clickText([action.name]);
    case "read": {
      const values: Record<string, number | null> = {};
      for (const f of action.fields) {
        const el = fieldFor(f.labels);
        values[f.key] = el ? amount(el.value) : null;
      }
      return values;
    }
    case "write": {
      const missing: string[] = [];
      for (const f of action.fields) {
        const el = fieldFor(f.labels);
        if (!el || (el instanceof HTMLInputElement && el.readOnly) || el.disabled) {
          missing.push(f.key);
          continue;
        }
        setValue(el, String(f.value));
        await wait(300);
      }
      return missing;
    }
    case "answerNo":
      return action.questions.filter((q) => !answerNo(q));
    case "isrCapture": {
      const pending: string[] = [];
      const { plan } = action;
      if (!answerNo("copropiedad")) pending.push('Contesta "No" a "¿Los ingresos fueron obtenidos a través de copropiedad?".');
      await wait(800);

      // Descuentos: el portal pide registrar el renglón aunque sea en cero.
      const discounts = buttonNear(["descuentos, devoluciones", "descuentos devoluciones"], ["capturar", "agregar"]);
      if (!discounts) pending.push('En "Descuentos, devoluciones y bonificaciones" agrega "Sin ingresos a disminuir" con 0.');
      else {
        discounts.click();
        if (!(await addInDialog(["sin ingresos a disminuir"], 0))) pending.push('Agrega "Sin ingresos a disminuir" con 0 en Descuentos.');
      }

      if (plan.incomeToAdd > 0) {
        const extra = buttonNear(["ingresos adicionales"], ["capturar", "agregar"]);
        extra?.click();
        if (!extra || !(await addInDialog(["no considerados en el prellenado"], plan.incomeToAdd))) {
          pending.push(`En "Ingresos adicionales" agrega "Ingresos no considerados en el prellenado" por $${plan.incomeToAdd}.`);
        }
      }
      if (plan.incomeToRemove > 0) {
        pending.push(
          `El SAT prellenó $${plan.incomeToRemove} más de lo que cobraste: revisa si hay facturas canceladas o PPD sin cobrar y ajústalo en "Descuentos, devoluciones y bonificaciones".`,
        );
      }

      const total = buttonNear(["total de ingresos percibidos"], ["capturar"]);
      total?.click();
      if (!total || !(await addInDialog(plan.activityOptions, plan.income))) {
        pending.push(`En "Total de ingresos percibidos" → Capturar, agrega tu tipo de ingreso por $${plan.income}.`);
      }

      if (plan.retainedToAdd !== 0) {
        // El ISR retenido se ajusta en "Ver detalle" sumando la diferencia a lo de facturas emitidas.
        clickText(["determinacion"]);
        await wait(1500);
        const detail = buttonNear(["isr retenido"], ["ver detalle", "capturar"]);
        detail?.click();
        await wait(1200);
        const root = scopeRoot();
        const diffInput = root === document ? null : fieldFor(["no considerado", "adicional", "otras retenciones", "diferencia"], root);
        if (!detail || !(diffInput instanceof HTMLInputElement) || plan.retainedToAdd < 0) {
          pending.push(
            `Ajusta el ISR retenido en "Ver detalle": ${plan.retainedToAdd > 0 ? "suma" : "resta"} $${Math.abs(plan.retainedToAdd)} para que cuadre con tus facturas; "No acreditable" va en 0.`,
          );
        } else {
          setValue(diffInput, String(plan.retainedToAdd));
          const notCreditable = fieldFor(["no acreditable"], root);
          if (notCreditable) setValue(notCreditable, "0");
          await wait(400);
          clickText(["cerrar", "guardar", "aceptar"], root);
        }
      }
      return pending;
    }
    case "ivaCreditable": {
      if (action.value === 0) return [];
      const button = buttonNear(["iva acreditable"], ["capturar"]);
      button?.click();
      await wait(1200);
      const root = scopeRoot();
      const input = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="text"], input[type="number"], input:not([type])')).find(
        (i) => visible(i) && !i.readOnly && !i.disabled,
      );
      if (!button || !input || root === document) {
        return [`En "IVA acreditable" → Capturar, escribe $${action.value}; en "actividades mixtas" pon 0.`];
      }
      setValue(input, String(action.value));
      const mixed = fieldFor(["mixtas"], root);
      if (mixed) setValue(mixed, "0");
      await wait(400);
      clickText(["continuar", "guardar", "aceptar"], root);
      await wait(800);
      return [];
    }
    case "admin":
      return clickText(["administracion de la declaracion"]);
    case "text":
      return document.body?.innerText ?? "";
    case "acuseLink": {
      const link = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).find(
        (a) => /\.pdf(\?|$)/i.test(a.href) || /acuse/i.test(a.textContent ?? ""),
      );
      return link?.href ?? null;
    }
    case "banner": {
      let box = document.getElementById("contabilizate-banner");
      if (!box) {
        box = document.createElement("div");
        box.id = "contabilizate-banner";
        box.style.cssText =
          "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);max-width:560px;z-index:999999;background:#03301D;" +
          "color:#fff;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.25);padding:14px 18px;font:14px system-ui,sans-serif";
        document.body.appendChild(box);
      }
      box.textContent = action.text;
      return true;
    }
  }
}

// ── Orquestación (corre en la página de la app) ──

export class DeclarationCancelledError extends Error {
  constructor() {
    super("Llenado cancelado");
  }
}

export interface FillProgress {
  status: string;
  percent: number;
}

export interface FillResult {
  tabId: number;
  prefill: PortalValues;
  /** Campos que no se encontraron o no se pudieron escribir. */
  missing: string[];
  /** Pasos que el usuario debe hacer a mano en el portal. */
  manualSteps: string[];
  /** Lo que el portal muestra después de llenar (incluye los calculados por el SAT). */
  after: PortalValues;
}

const STATUS_TITLE = "Contabilizate · declaración";

async function agent<T>(tabId: number, action: AgentAction): Promise<T> {
  return (await run(tabId, portalAgent, [action])) as T;
}

/** Espera a que la página muestre alguno de los textos; tolera navegaciones y el login. */
async function waitForText(tabId: number, texts: string[], isCancelled: () => boolean, timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (isCancelled()) throw new DeclarationCancelledError();
    const found = await agent<boolean>(tabId, { type: "hasText", texts }).catch(() => false);
    if (found) return;
    await delay(1500);
  }
  throw new Error(`El portal no mostró "${texts[0]}" a tiempo`);
}

/** Copia solo los valores encontrados, para no borrar lo leído en otra pestaña. */
function mergeKnown(target: PortalValues, values: PortalValues) {
  for (const [key, value] of Object.entries(values)) if (value !== null || !(key in target)) target[key] = value;
}

const fieldsOf = (obligation: Obligation) => PORTAL_FIELDS.filter((f) => f.obligation === obligation);

/**
 * Abre el portal, llena datos iniciales y obligaciones, lee lo prellenado,
 * captura lo autorizado y se detiene antes de Enviar.
 */
export async function fillDeclaration(
  year: number,
  month: number,
  values: PortalValues,
  activity: ResicoActivity | undefined,
  onProgress: (p: FillProgress) => void,
  isCancelled: () => boolean,
): Promise<FillResult> {
  const tab = await chrome.tabs.create({ url: DECLARATION_URL, active: true });
  const tabId = tab.id!;
  const report = async (status: string, percent: number) => {
    onProgress({ status, percent });
    await run(tabId, showPageStatus, [STATUS_TITLE, status, percent]).catch(() => {});
  };
  const ensureActive = () => {
    if (isCancelled()) throw new DeclarationCancelledError();
  };

  onProgress({ status: "Esperando el portal de Declaraciones (inicia sesión si te lo pide)…", percent: 5 });
  // Tras el login aparece el inicio del servicio con "Presentar declaración".
  await waitForText(tabId, ["presentar declaracion", "ejercicio"], isCancelled, LOGIN_TIMEOUT_MS);
  await run(tabId, clickPresentar, []);
  await waitForText(tabId, ["periodicidad"], isCancelled, 30_000);

  await report("Llenando datos iniciales…", 15);
  const initial = await agent<boolean[]>(tabId, { type: "selectInitial", year, month });
  if (initial.some((ok) => !ok)) {
    throw new Error("No se pudieron elegir ejercicio, periodo y tipo de declaración; complétalos a mano y vuelve a intentar.");
  }
  if (await agent<boolean>(tabId, { type: "hasText", texts: ["complementaria"] })) {
    // Ya hay una declaración normal del periodo: las complementarias no están soportadas.
    throw new Error("Ese periodo ya tiene una declaración presentada; la app aún no hace complementarias.");
  }
  await agent(tabId, { type: "banner", text: "Contabilizate está llenando la declaración. No cierres esta pestaña." });

  await report("Eligiendo obligaciones ISR e IVA de RESICO…", 22);
  await waitForText(tabId, ["simplificado de confianza"], isCancelled, 30_000);
  const obligations = await agent<boolean[]>(tabId, { type: "selectObligations" });
  if (!obligations[0]) throw new Error("No se encontró la obligación de ISR de RESICO en el portal.");
  await delay(800);
  await agent(tabId, { type: "next" });
  // El portal tarda en traer el prellenado de los CFDI.
  await delay(6000);

  const prefill: PortalValues = {};
  const after: PortalValues = {};
  const missing: string[] = [];
  const manualSteps: string[] = [];
  if (!obligations[1]) {
    missing.push(...fieldsOf("iva").map((f) => f.key));
    manualSteps.push("No se encontró la obligación de IVA: agrégala a mano si te corresponde.");
  }

  // ISR
  ensureActive();
  await report("Leyendo lo que el SAT prellenó de ISR…", 35);
  await agent(tabId, { type: "openObligation", obligation: "isr" });
  await delay(3000);
  mergeKnown(prefill, await agent<PortalValues>(tabId, { type: "read", fields: fieldsOf("isr") }));
  // Tasa, impuesto y retenido están en la pestaña Determinación.
  await agent(tabId, { type: "tab", name: "determinacion" });
  await delay(1500);
  mergeKnown(prefill, await agent<PortalValues>(tabId, { type: "read", fields: fieldsOf("isr") }));
  const plan = buildFillPlan(prefill, values, activity);

  await report("Capturando ingresos y retenciones de ISR…", 45);
  await agent(tabId, { type: "tab", name: "ingresos" });
  await delay(1000);
  manualSteps.push(...(await agent<string[]>(tabId, { type: "isrCapture", plan: plan.isr })));
  await agent(tabId, { type: "tab", name: "determinacion" });
  await delay(1500);
  mergeKnown(after, await agent<PortalValues>(tabId, { type: "read", fields: fieldsOf("isr") }));
  await finishObligation(tabId, ["compensaciones", "estimulo"], manualSteps, "ISR");

  // IVA
  if (obligations[1]) {
    ensureActive();
    await report("Leyendo lo que el SAT prellenó de IVA…", 65);
    await agent(tabId, { type: "openObligation", obligation: "iva" });
    await delay(3000);
    Object.assign(prefill, await agent<PortalValues>(tabId, { type: "read", fields: fieldsOf("iva") }));
    const ivaPlan = buildFillPlan(prefill, values, activity).iva;

    await report("Capturando IVA…", 75);
    missing.push(...(await agent<string[]>(tabId, { type: "write", fields: ivaPlan.direct })));
    manualSteps.push(...(await agent<string[]>(tabId, { type: "ivaCreditable", value: ivaPlan.creditable })));
    await delay(1500);
    Object.assign(after, await agent<PortalValues>(tabId, { type: "read", fields: fieldsOf("iva") }));
    await finishObligation(tabId, ["estimulo"], manualSteps, "IVA");
  }

  await report("Listo: revisa y presiona Enviar tú mismo", 100);
  await agent(tabId, {
    type: "banner",
    text: "Contabilizate terminó de capturar. Revisa cada obligación y presiona Enviar declaración tú mismo; después vuelve a la app para guardar el acuse.",
  });
  setTimeout(() => run(tabId, removePageStatus, []).catch(() => {}), 5000);
  return { tabId, prefill, missing: [...new Set(missing)], manualSteps, after };
}

/** Pestaña Pago: "No" a compensaciones y estímulos, Guardar y volver a la administración de la declaración. */
async function finishObligation(tabId: number, questions: string[], manualSteps: string[], name: string) {
  await agent(tabId, { type: "tab", name: "pago" });
  await delay(1500);
  const unanswered = await agent<string[]>(tabId, { type: "answerNo", questions });
  for (const q of unanswered) manualSteps.push(`${name} → Pago: contesta "No" a la pregunta de ${q}.`);
  await delay(500);
  await run(tabId, clickSave, []);
  await delay(1500);
  if (!(await agent<boolean>(tabId, { type: "admin" }))) {
    manualSteps.push(`Después de ${name}, presiona "Administración de la declaración".`);
  }
  await delay(2500);
}

/** "Presentar declaración" en el inicio del servicio; inyectada aparte porque no lleva argumentos. */
function clickPresentar() {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const button = Array.from(document.querySelectorAll<HTMLElement>("button, a, input[type=button]")).find(
    (b) => b.offsetParent !== null && norm(b.innerText || (b as HTMLInputElement).value || "").includes("presentar declaracion"),
  );
  button?.click();
  return !!button;
}

function clickSave() {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const button = Array.from(document.querySelectorAll<HTMLElement>("button, a, input[type=button]")).find(
    (b) => b.offsetParent !== null && norm(b.innerText || (b as HTMLInputElement).value || "") === "guardar",
  );
  button?.click();
  return !!button;
}

/**
 * Espera a que el usuario envíe y aparezca el acuse en la pestaña; lo lee y
 * descarga el PDF si el portal ofrece el enlace. Espera hasta 30 minutos.
 */
export async function waitForAcuse(
  tabId: number,
  year: number,
  month: number,
  isCancelled: () => boolean,
): Promise<Acuse> {
  const started = Date.now();
  while (Date.now() - started < 30 * 60 * 1000) {
    if (isCancelled()) throw new DeclarationCancelledError();
    const text = await agent<string>(tabId, { type: "text" }).catch((e: Error) => {
      if (/no tab with id/i.test(e.message)) throw new Error("Se cerró la pestaña del SAT antes del acuse");
      return "";
    });
    const acuse = parseAcuse(text);
    if (acuse?.operationNumber) {
      const pdf = await agent<string | null>(tabId, { type: "acuseLink" }).catch(() => null);
      if (pdf) {
        await chrome.downloads
          .download({ url: pdf, filename: `contabilizate/declaraciones/acuse-${year}-${String(month).padStart(2, "0")}.pdf` })
          .catch(() => {});
      }
      return acuse;
    }
    await delay(3000);
  }
  throw new Error("No apareció el acuse; si ya enviaste, captura la línea de captura a mano.");
}
