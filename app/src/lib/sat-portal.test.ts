// @vitest-environment happy-dom
// Corre las acciones que se inyectan en el portal contra HTML real guardado del
// SAT (app/src/lib/__fixtures__/sat-portal, octubre 2026, sin enviar).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import formulario from "./__fixtures__/sat-portal/formulario-resico.html?raw";
import perfil from "./__fixtures__/sat-portal/perfil-declaracion.html?raw";
import temporales from "./__fixtures__/sat-portal/temporales.html?raw";
import { PORTAL_FIELDS, PORTAL_KEYS, portalAgent, type AgentAction } from "./sat-declaration";

function load(html: string) {
  document.body.innerHTML = html;
}

/** Corre la acción adelantando los `setTimeout` con los que el agente espera al portal. */
async function act<T>(action: AgentAction): Promise<T> {
  const result = portalAgent(action);
  await vi.runAllTimersAsync();
  return (await result) as T;
}

const byKey = (key: string) => document.querySelector<HTMLInputElement & HTMLSelectElement>(`[view-model="${key}"]`)!;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("configuración (PerfilDeclaracion)", () => {
  beforeEach(() => load(perfil));

  it("reconoce la página", async () => {
    expect(await act({ type: "state" })).toEqual({ page: "perfil", loading: false });
  });

  it("elige ejercicio, periodicidad, periodo y tipo Normal", async () => {
    expect(await act({ type: "configure", year: 2026, month: 9 })).toEqual({});
    expect(document.querySelector<HTMLSelectElement>("#periodicidad")!.value).toBe("M");
    expect(document.querySelector<HTMLSelectElement>("#periodos")!.value).toBe("009");
    expect(document.querySelector<HTMLSelectElement>("#tipodeclaracion")!.value).toBe("001");
  });

  it("avisa cuando el periodo no está disponible", async () => {
    const result = await act<{ error?: string }>({ type: "configure", year: 2026, month: 12 });
    expect(result.error).toMatch(/periodo/);
  });

  it("sin la opción Normal, el periodo ya fue presentado", async () => {
    document.querySelector('#tipodeclaracion option[value="001"]')!.remove();
    const result = await act<{ error?: string }>({ type: "configure", year: 2026, month: 10 });
    expect(result.error).toMatch(/complementarias/);
  });

  it("deja marcadas las obligaciones de RESICO sin hacer clic", async () => {
    const clicks = vi.fn();
    for (const id of ["0168", "0318"]) document.querySelector(`label[for="${id}"]`)!.addEventListener("click", clicks);
    expect(await act({ type: "selectObligations" })).toEqual({ isr: true, iva: true });
    expect(clicks).not.toHaveBeenCalled();
  });

  it("marca la obligación de IVA si viene desmarcada", async () => {
    const box = document.getElementById("0318") as HTMLInputElement;
    box.checked = false;
    expect(await act({ type: "selectObligations" })).toEqual({ isr: true, iva: true });
  });

  it("reemplaza el borrador solo si el portal lo pregunta", async () => {
    const replace = vi.fn();
    document.querySelector("#modalYesNo button.si")!.addEventListener("click", replace);
    expect(await act({ type: "replaceDraft" })).toBe(false);
    document.getElementById("modalYesNo")!.classList.add("show");
    expect(await act({ type: "replaceDraft" })).toBe(true);
    expect(replace).toHaveBeenCalledOnce();
  });
});

describe("borradores (Temporales)", () => {
  beforeEach(() => load(temporales));

  it("reconoce la página e inicia una nueva declaración", async () => {
    const start = vi.fn();
    document.getElementById("newForm")!.addEventListener("click", start);
    expect(await act({ type: "state" })).toEqual({ page: "temporales", loading: false });
    expect(await act({ type: "newForm" })).toBe(true);
    expect(start).toHaveBeenCalledOnce();
  });
});

describe("formulario de ISR e IVA RESICO", () => {
  beforeEach(() => load(formulario));

  it("encuentra todas las llaves que usa la app", () => {
    const entities = { isr: "457", iva: "454" };
    const keys = [
      ...PORTAL_FIELDS.flatMap((f) => f.codes.map((code) => code.replaceAll("{e}", entities[f.obligation]))),
      ...Object.values(PORTAL_KEYS.isr).map((k) => k.replaceAll("{e}", entities.isr)),
      ...Object.values(PORTAL_KEYS.iva).map((k) => k.replaceAll("{e}", entities.iva)),
    ];
    const bound = (key: string) =>
      document.querySelector(`[view-model="${key}"]`) ??
      Array.from(document.querySelectorAll("[data-bind]")).find((el) => new RegExp(`value:\\s*${key}\\b`).test(el.getAttribute("data-bind")!));
    expect(keys.filter((key) => !bound(key))).toEqual([]);
  });

  it("resuelve las entidades de ISR e IVA desde el menú", async () => {
    expect(await act({ type: "prepareForm" })).toEqual({ loading: false, entities: { isr: "457", iva: "454" } });
  });

  it("lee lo prellenado de ISR", async () => {
    const fields = PORTAL_FIELDS.filter((f) => f.obligation === "isr");
    expect(await act({ type: "read", entity: "457", fields })).toEqual({
      "isr.ingresos": 8333,
      "isr.tasa": 1,
      "isr.impuesto": 83,
      "isr.retenido": 0,
      "isr.aCargo": 83,
    });
  });

  it("lee lo prellenado de IVA; el resultado toma el renglón distinto de cero", async () => {
    const fields = PORTAL_FIELDS.filter((f) => f.obligation === "iva");
    expect(await act({ type: "read", entity: "454", fields })).toMatchObject({
      "iva.gravados16": 0,
      "iva.gravados8": 8333,
      "iva.trasladado": 667,
      "iva.retenido": 0,
      "iva.resultado": 667,
    });
  });

  it("escribe renglones editables de IVA y reporta los de solo lectura", async () => {
    const changed = vi.fn();
    byKey("E4540001PSAT1200110").addEventListener("change", changed);
    const missing = await act({
      type: "write",
      entity: "454",
      fields: [
        { key: "iva.retenido", codes: ["E{e}0001PSAT1200110"], value: 500 },
        { key: "iva.trasladado", codes: ["E{e}0001PSAT1200108"], value: 1 },
      ],
    });
    expect(missing).toEqual(["iva.trasladado"]);
    expect(byKey("E4540001PSAT1200110").value).toBe("500");
    expect(changed).toHaveBeenCalled();
  });

  it("contesta las preguntas Sí/No por llave", async () => {
    expect(await act({ type: "setSelect", entity: "457", key: PORTAL_KEYS.isr.coownership, value: "2" })).toBe(true);
    expect(byKey("E4570001PSAT1100105").value).toBe("2");
    expect(await act({ type: "setSelect", entity: "457", key: PORTAL_KEYS.isr.coownership, value: "9" })).toBe(false);
  });

  it("clasifica el total de ingresos en su ventana: Agregar, concepto, importe, Guardar renglón y Cerrar", async () => {
    const concept = byKey("E4570012PSAT1100503");
    const amountInput = byKey("E4570012PSAT1100504");
    // Knockout habilita el importe al elegir el concepto.
    concept.addEventListener("change", () => (amountInput.disabled = false));
    const modal = document.getElementById("modal-457modal70")!;
    modal.classList.add("show");
    const saveRow = vi.fn();
    const saveModal = vi.fn();
    const close = vi.fn();
    modal.querySelector(".btnAddItem")!.addEventListener("click", saveRow);
    modal.querySelector(".btnGuardarModal")!.addEventListener("click", saveModal);
    modal.querySelector(".cerrar-modal")!.addEventListener("click", close);

    const ok = await act({
      type: "modal",
      entity: "457",
      target: PORTAL_KEYS.isr.total,
      rows: [{ conceptKey: PORTAL_KEYS.isr.totalConcept, option: { texts: ["honorarios"] }, amountKey: PORTAL_KEYS.isr.totalAmount, amount: 8333 }],
      fields: [],
    });
    expect(ok).toBe(true);
    expect(concept.value).toBe("I2");
    expect(amountInput.value).toBe("8333");
    expect(saveRow).toHaveBeenCalledOnce();
    // "Guardar" de la ventana está oculto en el portal; se cierra con "Cerrar".
    expect(saveModal).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("no cierra la ventana si el importe sigue bloqueado", async () => {
    const close = vi.fn();
    document.getElementById("modal-457modal70")!.classList.add("show");
    document.querySelector("#modal-457modal70 .cerrar-modal")!.addEventListener("click", close);
    const ok = await act({
      type: "modal",
      entity: "457",
      target: PORTAL_KEYS.isr.total,
      rows: [{ conceptKey: PORTAL_KEYS.isr.totalConcept, option: { texts: ["actividad empresarial"] }, amountKey: PORTAL_KEYS.isr.totalAmount, amount: 100 }],
      fields: [],
    });
    expect(ok).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });

  it("captura el IVA acreditable con mixtas en cero", async () => {
    const keys = PORTAL_KEYS.iva;
    const ok = await act({
      type: "modal",
      entity: "454",
      target: keys.creditable,
      rows: [],
      fields: [
        { key: keys.creditableTaxed, value: 1170 },
        { key: keys.creditableMixed, value: 0 },
      ],
    });
    expect(ok).toBe(true);
    expect(byKey("E4540006PSAT1200602").value).toBe("1170");
    expect(byKey("E4540006PSAT1200603").value).toBe("0");
  });

  it("recorre las pestañas de la obligación en orden", async () => {
    const clicked: string[] = [];
    for (const tab of document.querySelectorAll('a.nav-link[href^="#tab457"]')) tab.addEventListener("click", () => clicked.push(tab.textContent!.trim()));
    expect(await act({ type: "visitTabs", entity: "457" })).toBe(4);
    expect(clicked.map((t) => t.replace(/\d+$/, ""))).toEqual(["Ingresos", "Determinación", "Pago", "Datos adicionales"]);
  });

  it("guarda con el enlace GUARDAR de la obligación", async () => {
    const save = vi.fn();
    document.querySelector(".guardardeclaracion")!.addEventListener("click", save);
    expect(await act({ type: "save" })).toBe(true);
    expect(save).toHaveBeenCalledOnce();
  });

  it("nunca presiona Enviar declaración", async () => {
    const send = vi.fn();
    document.getElementById("btnEnviaDec")?.addEventListener("click", send);
    for (const action of [{ type: "save" }, { type: "admin" }, { type: "prepareForm" }] as AgentAction[]) await act(action);
    expect(send).not.toHaveBeenCalled();
  });
});
