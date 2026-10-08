// Scrape y llenado de la declaración mensual de RESICO en el portal de pagos
// provisionales del SAT. Lee lo que el SAT prellenó, escribe los valores que el
// usuario autorizó y se detiene antes de "Enviar": el envío lo hace el usuario.
// Flujo: docs/declaracion-resico.md. Selectores: docs/sat-portal-resico-map.md.
import { round2 } from "./bill-calc";
import { delay, LOGIN_TIMEOUT_MS, removePageStatus, run, showPageStatus } from "./sat-tab";
import type { IsrResico, IvaResico, PortalValues, ResicoActivity } from "./types";

/** Nuevo portal de pagos provisionales; "Temporales" redirige a la configuración si no hay borradores. */
export const DECLARATION_URL = "https://pstcdypisr.clouda.sat.gob.mx/Declaracion/Temporales";

export type Obligation = "isr" | "iva";

/**
 * Llave del modelo del formulario del SAT (atributo `view-model` o `data-bind`).
 * `{e}` es la entidad de la obligación (457 = ISR RESICO, 454 = IVA RESICO
 * fronterizo); se resuelve en el portal para no depender de la región.
 */
export type PortalKey = `E{e}${string}`;

export interface PortalField {
  key: string;
  obligation: Obligation;
  /** Llaves a leer; con varias, gana la primera distinta de cero. */
  codes: PortalKey[];
}

export const PORTAL_FIELDS: PortalField[] = [
  { key: "isr.ingresos", obligation: "isr", codes: ["E{e}0020PSAT1101001"] },
  { key: "isr.tasa", obligation: "isr", codes: ["E{e}0020PSAT1101004"] },
  { key: "isr.impuesto", obligation: "isr", codes: ["E{e}0020PSAT1101005"] },
  { key: "isr.retenido", obligation: "isr", codes: ["E{e}0020PSAT1101006"] },
  { key: "isr.aCargo", obligation: "isr", codes: ["E{e}0020PSAT1101007"] },
  { key: "iva.gravados16", obligation: "iva", codes: ["E{e}0001PSAT1200101"] },
  // En el IVA fronterizo es "Actividades sujetas al estímulo de la región fronteriza".
  { key: "iva.gravados8", obligation: "iva", codes: ["E{e}0001PSAT1200102"] },
  { key: "iva.gravados0", obligation: "iva", codes: ["E{e}0001PSAT1200103"] },
  { key: "iva.exentos", obligation: "iva", codes: ["E{e}0001PSAT1200104"] },
  { key: "iva.noObjeto", obligation: "iva", codes: ["E{e}0001PSAT1200105"] },
  { key: "iva.trasladado", obligation: "iva", codes: ["E{e}0001PSAT1200108"] },
  { key: "iva.retenido", obligation: "iva", codes: ["E{e}0001PSAT1200110"] },
  { key: "iva.acreditable", obligation: "iva", codes: ["E{e}0001PSAT1200111"] },
  { key: "iva.saldoAnterior", obligation: "iva", codes: ["E{e}0001PSAT1200114"] },
  // Impuesto a cargo o, si es cero, impuesto a favor.
  { key: "iva.resultado", obligation: "iva", codes: ["E{e}0001PSAT1200115", "E{e}0001PSAT1200116"] },
];

/** Llaves de los pasos de captura que no son renglones de `PORTAL_FIELDS`. */
export const PORTAL_KEYS = {
  isr: {
    coownership: "E{e}0001PSAT1100105",
    discounts: "E{e}0001PSAT1100106",
    discountsCoownership: "E{e}0001PSAT1100608",
    hasDecrease: "E{e}0001PSAT1100107",
    hasExtra: "E{e}0001PSAT1100108",
    extra: "E{e}0001PSAT1100103",
    extraConcept: "E{e}0010PSAT1100401",
    extraAmount: "E{e}0010PSAT1100402",
    total: "E{e}0001PSAT1100104",
    toDetail: "E{e}0001PSAT1100501",
    totalConcept: "E{e}0012PSAT1100503",
    totalAmount: "E{e}0012PSAT1100504",
    retained: "E{e}0020PSAT1101006",
    retainedAdd: "E{e}0020PSUMAISR007",
    retainedNotCreditable: "E{e}0020PSAT1101216",
    compensations: "E{e}0017P{e}0301001",
    stimulus: "E{e}0017P{e}0301002",
  },
  iva: {
    creditable: "E{e}0001PSAT1200111",
    creditableTaxed: "E{e}0006PSAT1200602",
    creditableMixed: "E{e}0006PSAT1200603",
    compensations: "E{e}0002P{e}0301001",
    stimulus: "E{e}0002P{e}0301002",
  },
} as const satisfies Record<Obligation, Record<string, PortalKey>>;

/** Valor de "Ingresos no considerados en el prellenado" en el concepto de ingresos adicionales. */
const EXTRA_INCOME_OPTION = "IA4";
const SELECT_YES = "1";
const SELECT_NO = "2";

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

/** Texto de la opción del portal (concepto de "Total de ingresos percibidos") para cada tipo de ingreso. */
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
    direct: { key: string; codes: PortalKey[]; value: number }[];
    /** Se captura con el botón "Capturar" (no viene prellenado). */
    creditable: number;
  };
}

const codesOf = (key: string) => PORTAL_FIELDS.find((f) => f.key === key)!.codes;

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
        .map((key) => ({ key, codes: codesOf(key), value: pesos(ours[key] ?? 0) }))
        // Los renglones en cero que el SAT tampoco trae no se tocan (muchos no existen para todos).
        .filter((f) => f.value !== 0 || (prefill[f.key] ?? 0) !== 0),
      creditable: pesos(ours["iva.acreditable"] ?? 0),
    },
  };
}

// ── Función que se inyecta en el portal (no puede usar nada de fuera) ──

export type PortalPage = "temporales" | "perfil" | "formulario" | "otra";

export interface ModalRow {
  /** Select del concepto y el valor de la opción, o textos a buscar en las opciones. */
  conceptKey: PortalKey;
  option: { value: string } | { texts: string[] };
  amountKey: PortalKey;
  amount: number;
}

export type AgentAction =
  | { type: "state" }
  | { type: "newForm" }
  | { type: "configure"; year: number; month: number }
  | { type: "selectObligations" }
  | { type: "next" }
  | { type: "replaceDraft" }
  | { type: "prepareForm" }
  | { type: "open"; entity: string }
  | { type: "visitTabs"; entity: string }
  | { type: "read"; entity: string; fields: { key: string; codes: PortalKey[] }[] }
  | { type: "write"; entity: string; fields: { key: string; codes: PortalKey[]; value: number }[] }
  | { type: "setSelect"; entity: string; key: PortalKey; value: string }
  | { type: "modal"; entity: string; target: PortalKey; rows: ModalRow[]; fields: { key: PortalKey; value: number }[] }
  | { type: "save" }
  | { type: "admin" }
  | { type: "text" }
  | { type: "acuseLink" }
  | { type: "banner"; text: string };

/**
 * Todo lo que se hace dentro del portal. Los campos se buscan por la llave del
 * modelo del SAT (estable) y no por el id del DOM, que depende del orden del
 * formulario. Lo que no aparece se regresa como pendiente y la app lo muestra
 * para captura manual en vez de fallar. Nunca toca "Enviar declaración".
 */
export async function portalAgent(action: AgentAction): Promise<unknown> {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const amount = (text: string) => {
    const clean = text.replace(/[$\s,%]/g, "");
    return /^-?\d+(\.\d+)?$/.test(clean) ? Number(clean) : null;
  };
  const resolve = (entity: string, key: string) => key.replaceAll("{e}", entity);

  const field = (key: string) =>
    document.querySelector<HTMLInputElement | HTMLSelectElement>(`[view-model="${key}"]`) ??
    Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-bind]")).find((el) =>
      new RegExp(`value:\\s*${key}\\b`).test(el.getAttribute("data-bind") ?? ""),
    ) ??
    null;
  const editable = (el: HTMLInputElement | HTMLSelectElement | null): el is HTMLInputElement | HTMLSelectElement =>
    !!el && !el.disabled && !(el instanceof HTMLInputElement && el.readOnly);

  const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
    el.focus();
    // Asignar con el setter nativo y disparar eventos: Knockout actualiza el modelo en "change"/"blur".
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    for (const type of ["input", "change", "blur"]) el.dispatchEvent(new Event(type, { bubbles: true }));
  };

  /** Elige una opción por valor; con `texts`, la primera cuyo texto contenga alguno. */
  const choose = (select: HTMLSelectElement, option: { value: string } | { texts: string[] }) => {
    const found = Array.from(select.options).find((o) =>
      "value" in option ? o.value === option.value : option.texts.some((t) => norm(o.text).includes(norm(t))),
    );
    if (!found || found.disabled) return false;
    setValue(select, found.value);
    return true;
  };

  /** Espera a que el select tenga sus opciones (los de configuración se cargan en cascada). */
  const loadedSelect = async (id: string) => {
    for (let i = 0; i < 60; i++) {
      const el = document.getElementById(id);
      if (el instanceof HTMLSelectElement && Array.from(el.options).filter((o) => !o.disabled).length > 0) return el;
      await wait(250);
    }
    return null;
  };

  const shownModals = () => Array.from(document.querySelectorAll<HTMLElement>(".modal.show"));
  const acceptAlerts = () => {
    for (const button of document.querySelectorAll<HTMLElement>(".bootbox-alert.show .bootbox-accept")) button.click();
  };

  /** Obligación de RESICO por impuesto ("isr" / "iva") en una lista de elementos con texto. */
  const resico = <T extends Element>(items: T[], tax: Obligation, text: (el: T) => string) =>
    items.find((el) => norm(text(el)).includes(`${tax} simplificado de confianza`));

  switch (action.type) {
    case "state": {
      const page: PortalPage = location.pathname.startsWith("/Formulario")
        ? "formulario"
        : document.getElementById("tipodeclaracion")
          ? "perfil"
          : document.getElementById("newForm")
            ? "temporales"
            : "otra";
      return { page, loading: shownModals().some((m) => norm(m.textContent ?? "").includes("cargando")) };
    }
    case "newForm": {
      const button = document.getElementById("newForm");
      button?.click();
      return !!button;
    }
    case "configure": {
      const steps: [string, string, string][] = [
        ["ejercicio", String(action.year), "el ejercicio"],
        ["periodicidad", "M", "la periodicidad mensual"],
        ["periodos", String(action.month).padStart(3, "0"), "el periodo"],
        ["tipodeclaracion", "001", "el tipo de declaración"],
      ];
      for (const [id, value, label] of steps) {
        const select = await loadedSelect(id);
        if (!select) return { error: `No cargó ${label} en el portal.` };
        if (!choose(select, { value })) {
          // Sin "Normal" el periodo ya tiene una declaración presentada.
          if (id === "tipodeclaracion") return { error: "Ese periodo ya tiene una declaración presentada; la app aún no hace complementarias." };
          return { error: `El portal no ofrece ${label} (${value}).` };
        }
        await wait(300);
      }
      for (let i = 0; i < 40 && !document.querySelector('input[name="btnObligacion"]'); i++) await wait(250);
      return document.querySelector('input[name="btnObligacion"]') ? {} : { error: "El portal no mostró las obligaciones a declarar." };
    }
    case "selectObligations": {
      const boxes = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="btnObligacion"]'));
      const result: Record<Obligation, boolean> = { isr: false, iva: false };
      for (const tax of ["isr", "iva"] as const) {
        const box = resico(boxes, tax, (b) => b.parentElement?.textContent ?? "");
        if (!box) continue;
        // Las registradas en el RFC ya vienen marcadas; un clic las desmarcaría.
        if (!box.checked) {
          document.querySelector<HTMLElement>(`label[for="${box.id}"]`)?.click();
          await wait(500);
          acceptAlerts();
        }
        result[tax] = box.checked;
      }
      return result;
    }
    case "next": {
      const button = document.getElementById("btnSiguiente");
      button?.click();
      return !!button;
    }
    case "replaceDraft": {
      // "Existe sin enviar una declaración del mismo tipo y periodo": se reemplaza para partir del prellenado.
      // El portal lo muestra como bootbox copiado de #modalYesNo (la plantilla nunca se abre).
      const modal = shownModals().find((m) => norm(m.textContent ?? "").includes("existe sin enviar"));
      const button = modal?.querySelector<HTMLElement>(".bootbox-accept, button.si");
      button?.click();
      return !!button;
    }
    case "prepareForm": {
      document.querySelector<HTMLElement>("#modalPrellenado.show button")?.click();
      const menus = Array.from(document.querySelectorAll<HTMLAnchorElement>("a.opcion-menu"));
      const entity = (tax: Obligation) =>
        resico(menus, tax, (a) => a.textContent ?? "")?.dataset.tituloGrupo?.match(/^(\d+)group/)?.[1] ?? null;
      return {
        loading: shownModals().some((m) => norm(m.textContent ?? "").includes("cargando")),
        entities: { isr: entity("isr"), iva: entity("iva") },
      };
    }
    case "open": {
      const link = document.querySelector<HTMLElement>(`a.opcion-menu[data-titulo-grupo="${action.entity}group1"]`);
      link?.click();
      return !!link;
    }
    case "visitTabs": {
      // El portal desbloquea las pestañas en orden (Pago queda deshabilitada hasta pasar por Determinación)
      // y solo marca la obligación como completa si se recorrieron todas.
      const tabs = Array.from(document.querySelectorAll<HTMLElement>(`a.nav-link[href^="#tab${action.entity}maincontainer"]`));
      for (const tab of tabs) {
        tab.click();
        await wait(1200);
      }
      return tabs.length;
    }
    case "read": {
      const values: Record<string, number | null> = {};
      for (const f of action.fields) {
        const found = f.codes.map((code) => {
          const el = field(resolve(action.entity, code));
          return el ? amount(el.value) : null;
        });
        values[f.key] = found.find((v) => v !== null && v !== 0) ?? found.find((v) => v !== null) ?? null;
      }
      return values;
    }
    case "write": {
      const missing: string[] = [];
      for (const f of action.fields) {
        const el = field(resolve(action.entity, f.codes[0]));
        if (!editable(el)) {
          missing.push(f.key);
          continue;
        }
        setValue(el, String(f.value));
        await wait(300);
      }
      return missing;
    }
    case "setSelect": {
      const el = field(resolve(action.entity, action.key));
      const ok = el instanceof HTMLSelectElement && choose(el, { value: action.value });
      if (ok) await wait(500);
      return ok;
    }
    case "modal": {
      // Los renglones con "Capturar"/"Ver detalle" se llenan en #modal-<id del campo>:
      // Agregar → concepto → importe → Guardar (renglón) … → Guardar (ventana).
      const target = field(resolve(action.entity, action.target));
      const modal = target && document.getElementById(`modal-${target.id}`);
      if (!target || !modal) return false;
      document.querySelector<HTMLElement>(`[data-idcontrol="${target.id}"]`)?.click();
      await wait(1200);
      for (const row of action.rows) {
        modal.querySelector<HTMLElement>(".btnNewItem")?.click();
        await wait(800);
        const concept = field(resolve(action.entity, row.conceptKey));
        if (!(concept instanceof HTMLSelectElement) || !choose(concept, row.option)) return false;
        // El importe se habilita al elegir el concepto.
        let input: HTMLInputElement | HTMLSelectElement | null = null;
        for (let i = 0; i < 10 && !editable(input); i++) {
          await wait(300);
          input = field(resolve(action.entity, row.amountKey));
        }
        if (!editable(input)) return false;
        setValue(input, String(row.amount));
        await wait(400);
        modal.querySelector<HTMLElement>(".btnAddItem")?.click();
        await wait(1000);
      }
      for (const f of action.fields) {
        const el = field(resolve(action.entity, f.key));
        if (!editable(el)) return false;
        setValue(el, String(f.value));
        await wait(300);
      }
      // Los valores se guardan al salir de cada campo; "Guardar" de la ventana casi siempre está oculto.
      const save = modal.querySelector<HTMLElement>(".btnGuardarModal");
      if (save && save.style.display !== "none") {
        save.click();
        await wait(1200);
        acceptAlerts();
      }
      if (modal.classList.contains("show")) {
        modal.querySelector<HTMLElement>(".cerrar-modal")?.click();
        await wait(800);
      }
      return true;
    }
    case "save": {
      const buttons = Array.from(document.querySelectorAll<HTMLElement>(".guardardeclaracion"));
      const button = buttons.find((b) => b.offsetParent !== null) ?? buttons[0];
      button?.click();
      await wait(1500);
      acceptAlerts();
      return !!button;
    }
    case "admin": {
      const button = document.getElementById("ir-menu-principal");
      button?.click();
      return !!button;
    }
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

interface PortalState {
  page: PortalPage;
  loading: boolean;
}

/**
 * Espera a que el portal muestre una de las páginas y termine de cargar; tolera
 * navegaciones y el login. `onWait` corre en cada vuelta (p. ej. para contestar un aviso).
 */
async function waitForPage(
  tabId: number,
  pages: PortalPage[],
  isCancelled: () => boolean,
  timeoutMs: number,
  onWait?: (state: PortalState | null) => Promise<unknown>,
): Promise<PortalPage> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (isCancelled()) throw new DeclarationCancelledError();
    const state = await agent<PortalState>(tabId, { type: "state" }).catch(() => null);
    if (state && pages.includes(state.page) && !state.loading) return state.page;
    await onWait?.(state).catch(() => {});
    await delay(1500);
  }
  throw new Error("El portal de declaraciones no respondió a tiempo");
}

/** Copia solo los valores encontrados, para no borrar lo leído en otra pestaña. */
function mergeKnown(target: PortalValues, values: PortalValues) {
  for (const [key, value] of Object.entries(values)) if (value !== null || !(key in target)) target[key] = value;
}

const fieldsOf = (obligation: Obligation) => PORTAL_FIELDS.filter((f) => f.obligation === obligation);

/**
 * Abre el portal, configura el periodo y las obligaciones, lee lo prellenado,
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
  // Tras el login llega a "Temporales" (si hay borradores) o directo a la configuración.
  const first = await waitForPage(tabId, ["temporales", "perfil"], isCancelled, LOGIN_TIMEOUT_MS);
  if (first === "temporales") {
    await agent(tabId, { type: "newForm" });
    await waitForPage(tabId, ["perfil"], isCancelled, 30_000);
  }

  await report("Llenando ejercicio, periodo y tipo de declaración…", 15);
  const config = await agent<{ error?: string }>(tabId, { type: "configure", year, month });
  if (config.error) throw new Error(config.error);
  await agent(tabId, { type: "banner", text: "Contabilizate está llenando la declaración. No cierres esta pestaña." });

  await report("Eligiendo obligaciones ISR e IVA de RESICO…", 22);
  const obligations = await agent<Record<Obligation, boolean>>(tabId, { type: "selectObligations" });
  if (!obligations.isr) throw new Error("No se encontró la obligación de ISR de RESICO en el portal.");
  await agent(tabId, { type: "next" });
  // Si ya hay un borrador del periodo, el portal pregunta si reemplazarlo. El prellenado tarda en cargar.
  await waitForPage(tabId, ["formulario"], isCancelled, 90_000, (state) =>
    state?.page === "perfil" ? agent(tabId, { type: "replaceDraft" }) : Promise.resolve(),
  );
  const entities = await prepareForm(tabId, isCancelled);
  if (!entities.isr) throw new Error("El formulario del SAT no trae la obligación de ISR de RESICO.");

  const prefill: PortalValues = {};
  const after: PortalValues = {};
  const missing: string[] = [];
  const manualSteps: string[] = [];
  if (!obligations.iva || !entities.iva) {
    missing.push(...fieldsOf("iva").map((f) => f.key));
    manualSteps.push("No se encontró la obligación de IVA: agrégala a mano si te corresponde.");
  }

  // ISR
  ensureActive();
  const isr = entities.isr;
  await report("Leyendo lo que el SAT prellenó de ISR…", 35);
  await agent(tabId, { type: "open", entity: isr });
  await delay(2500);
  mergeKnown(prefill, await agent<PortalValues>(tabId, { type: "read", entity: isr, fields: fieldsOf("isr") }));
  const plan = buildFillPlan(prefill, values, activity);

  await report("Capturando ingresos y retenciones de ISR…", 45);
  manualSteps.push(...(await captureIsr(tabId, isr, plan.isr)));
  mergeKnown(after, await agent<PortalValues>(tabId, { type: "read", entity: isr, fields: fieldsOf("isr") }));
  await finishObligation(tabId, isr, PORTAL_KEYS.isr, manualSteps, "ISR");

  // IVA
  if (obligations.iva && entities.iva) {
    ensureActive();
    const iva = entities.iva;
    await report("Leyendo lo que el SAT prellenó de IVA…", 65);
    await agent(tabId, { type: "open", entity: iva });
    await delay(2500);
    Object.assign(prefill, await agent<PortalValues>(tabId, { type: "read", entity: iva, fields: fieldsOf("iva") }));
    const ivaPlan = buildFillPlan(prefill, values, activity).iva;

    await report("Capturando IVA…", 75);
    missing.push(...(await agent<string[]>(tabId, { type: "write", entity: iva, fields: ivaPlan.direct })));
    if (ivaPlan.creditable !== 0) {
      const keys = PORTAL_KEYS.iva;
      const ok = await agent<boolean>(tabId, {
        type: "modal",
        entity: iva,
        target: keys.creditable,
        rows: [],
        fields: [
          { key: keys.creditableTaxed, value: ivaPlan.creditable },
          { key: keys.creditableMixed, value: 0 },
        ],
      });
      if (!ok) manualSteps.push(`En "IVA acreditable del periodo" → Capturar, escribe $${ivaPlan.creditable}; en "actividades mixtas" pon 0.`);
    }
    await delay(1000);
    Object.assign(after, await agent<PortalValues>(tabId, { type: "read", entity: iva, fields: fieldsOf("iva") }));
    await finishObligation(tabId, iva, PORTAL_KEYS.iva, manualSteps, "IVA");
  }

  await report("Listo: revisa y presiona Enviar tú mismo", 100);
  await agent(tabId, {
    type: "banner",
    text: "Contabilizate terminó de capturar. Revisa cada obligación y presiona Enviar declaración tú mismo; después vuelve a la app para guardar el acuse.",
  });
  setTimeout(() => run(tabId, removePageStatus, []).catch(() => {}), 5000);
  return { tabId, prefill, missing: [...new Set(missing)], manualSteps, after };
}

/** Espera el prellenado, cierra su aviso y regresa las entidades de ISR e IVA del formulario. */
async function prepareForm(tabId: number, isCancelled: () => boolean) {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    if (isCancelled()) throw new DeclarationCancelledError();
    const form = await agent<{ loading: boolean; entities: Record<Obligation, string | null> }>(tabId, { type: "prepareForm" }).catch(() => null);
    if (form && !form.loading && form.entities.isr) {
      await delay(1000);
      return form.entities;
    }
    await delay(1500);
  }
  throw new Error("El formulario del SAT no terminó de cargar");
}

/** Pestaña Ingresos y ajuste del ISR retenido. Regresa los pasos que quedan para el usuario. */
async function captureIsr(tabId: number, entity: string, plan: FillPlan["isr"]): Promise<string[]> {
  const keys = PORTAL_KEYS.isr;
  const pending: string[] = [];
  const answer = (key: PortalKey, value: string) => agent<boolean>(tabId, { type: "setSelect", entity, key, value });

  if (!(await answer(keys.coownership, SELECT_NO))) pending.push('Contesta "No" a "¿Los ingresos fueron obtenidos a través de copropiedad?".');
  // El renglón de copropiedad en "Descuentos" es obligatorio aunque vaya en cero.
  const discounts = await agent<boolean>(tabId, { type: "modal", entity, target: keys.discounts, rows: [], fields: [{ key: keys.discountsCoownership, value: 0 }] });
  if (!discounts) pending.push('En "Descuentos, devoluciones y bonificaciones" → Capturar, pon 0 en "de integrantes por copropiedad".');
  if (!(await answer(keys.hasDecrease, SELECT_NO))) pending.push('Contesta "No" a "¿Tienes ingresos a disminuir?".');
  if (plan.incomeToRemove > 0) {
    pending.push(
      `El SAT prellenó $${plan.incomeToRemove} más de lo que cobraste: revisa si hay facturas canceladas o PPD sin cobrar y ajústalo en "Ingresos a disminuir".`,
    );
  }

  if (plan.incomeToAdd > 0) {
    const ok =
      (await answer(keys.hasExtra, SELECT_YES)) &&
      (await agent<boolean>(tabId, {
        type: "modal",
        entity,
        target: keys.extra,
        rows: [{ conceptKey: keys.extraConcept, option: { value: EXTRA_INCOME_OPTION }, amountKey: keys.extraAmount, amount: plan.incomeToAdd }],
        fields: [],
      }));
    if (!ok) pending.push(`En "Ingresos adicionales" agrega "Ingresos no considerados en el prellenado" por $${plan.incomeToAdd}.`);
  } else if (!(await answer(keys.hasExtra, SELECT_NO))) {
    pending.push('Contesta "No" a "¿Tienes ingresos adicionales?".');
  }

  // El desglose por tipo de ingreso debe sumar el "Monto por detallar" que calcula el portal.
  const toDetail = (await agent<PortalValues>(tabId, { type: "read", entity, fields: [{ key: "toDetail", codes: [keys.toDetail] }] })).toDetail;
  const income = toDetail || plan.income;
  const classified = await agent<boolean>(tabId, {
    type: "modal",
    entity,
    target: keys.total,
    rows: [{ conceptKey: keys.totalConcept, option: { texts: plan.activityOptions }, amountKey: keys.totalAmount, amount: income }],
    fields: [],
  });
  if (!classified) pending.push(`En "Total de ingresos percibidos" → Capturar, agrega tu tipo de ingreso por $${income}.`);

  if (plan.retainedToAdd !== 0) {
    // En "Ver detalle" del ISR retenido: lo que falta se adiciona y lo que sobra va como no acreditable;
    // el portal pide los dos renglones, el otro en cero.
    const ok = await agent<boolean>(tabId, {
      type: "modal",
      entity,
      target: keys.retained,
      rows: [],
      fields: [
        { key: keys.retainedAdd, value: Math.max(0, plan.retainedToAdd) },
        { key: keys.retainedNotCreditable, value: Math.max(0, -plan.retainedToAdd) },
      ],
    });
    if (!ok) {
      pending.push(
        plan.retainedToAdd > 0
          ? `En ISR retenido → Ver detalle, escribe $${plan.retainedToAdd} en "ISR retenido a adicionar".`
          : `En ISR retenido → Ver detalle, escribe $${-plan.retainedToAdd} en "ISR retenido no acreditable".`,
      );
    }
  }
  return pending;
}

/**
 * Recorre las pestañas (si no, el portal no la da por completa), contesta "No" a
 * compensaciones y estímulos en Pago, guarda y vuelve a la administración de la declaración.
 */
async function finishObligation(
  tabId: number,
  entity: string,
  keys: { compensations: PortalKey; stimulus: PortalKey },
  manualSteps: string[],
  name: string,
) {
  await agent(tabId, { type: "visitTabs", entity });
  for (const [key, question] of [
    [keys.compensations, "compensaciones"],
    [keys.stimulus, "estímulos"],
  ] as const) {
    if (!(await agent<boolean>(tabId, { type: "setSelect", entity, key, value: SELECT_NO }))) {
      manualSteps.push(`${name} → Pago: contesta "No" a la pregunta de ${question}.`);
    }
  }
  if (!(await agent<boolean>(tabId, { type: "save" }))) manualSteps.push(`${name}: presiona "Guardar".`);
  if (!(await agent<boolean>(tabId, { type: "admin" }))) {
    manualSteps.push(`Después de ${name}, presiona "Administración de la declaración".`);
  }
  await delay(2500);
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
