// Descarga de CFDI desde el portal del SAT (portalcfdi). Port de
// js/download/download-manager.js del popup: abre una pestaña del portal, llena
// la búsqueda, lee la tabla de resultados y descarga el XML y el PDF de cada una.

export type InvoiceType = "emitidas" | "recibidas";

export interface DownloadRequest {
  type: InvoiceType;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
  includePdf: boolean;
}

export interface DownloadProgress {
  status: string;
  percent: number;
  done: number;
  total: number;
}

export interface DownloadResult {
  uuids: string[];
  failed: string[];
}

interface PortalInvoice {
  uuid: string;
  xmlUrl: string | null;
  pdfUrl: string | null;
}

const PORTAL = "https://portalcfdi.facturaelectronica.sat.gob.mx";
const QUERY_URL: Record<InvoiceType, string> = {
  emitidas: `${PORTAL}/ConsultaEmisor.aspx`,
  recibidas: `${PORTAL}/ConsultaReceptor.aspx`,
};
/** Tiempo máximo para que el usuario (o la e.firma desbloqueada) inicie sesión. */
const LOGIN_TIMEOUT_MS = 3 * 60 * 1000;

export class DownloadCancelledError extends Error {
  constructor() {
    super("Descarga cancelada");
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function monthsBetween(startDate: string, endDate: string): { year: number; month: number }[] {
  const [sy, sm] = startDate.split("-").map(Number);
  const [ey, em] = endDate.split("-").map(Number);
  const months = [];
  for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m === 12 ? (y++, (m = 1)) : m++) {
    months.push({ year: y, month: m });
  }
  return months;
}

/**
 * Espera a que la pestaña llegue a la página de consulta. Si la sesión expiró,
 * el SAT la manda al login: ahí el script de inicio de sesión entra solo si la
 * e.firma está desbloqueada, o el usuario inicia sesión a mano.
 */
function waitForQueryPage(tabId: number, url: string, isCancelled: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearInterval(timer);
    };
    const check = (tab: chrome.tabs.Tab) => {
      if (tab.status === "complete" && tab.url?.startsWith(url)) {
        cleanup();
        resolve();
      }
    };
    const onUpdated = (id: number, _info: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
      if (id === tabId) check(tab);
    };
    const onRemoved = (id: number) => {
      if (id !== tabId) return;
      cleanup();
      reject(new Error("Se cerró la pestaña del SAT"));
    };
    const timer = setInterval(() => {
      if (isCancelled()) {
        cleanup();
        reject(new DownloadCancelledError());
      } else if (Date.now() - started > LOGIN_TIMEOUT_MS) {
        cleanup();
        reject(new Error("No se inició sesión en el SAT a tiempo"));
      }
    }, 500);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.get(tabId).then(check, () => {});
  });
}

async function run<A extends unknown[], R>(tabId: number, func: (...args: A) => R, args: A): Promise<Awaited<R>> {
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return result.result as Awaited<R>;
}

// ── Funciones que se inyectan en el portal (no pueden usar nada de fuera) ──

function fillEmitidasForm(sd: string, sm: string, sy: string, ed: string, em: string, ey: string) {
  return new Promise<void>((resolve) => {
    const fechaRadio = document.querySelector<HTMLInputElement>('input[value="RdoFechas"]');
    if (fechaRadio && !fechaRadio.checked) fechaRadio.click();
    setTimeout(() => {
      const initialInput = document.querySelector<HTMLInputElement>("#ctl00_MainContent_CldFechaInicial2_Calendario_text");
      const finalInput = document.querySelector<HTMLInputElement>("#ctl00_MainContent_CldFechaFinal2_Calendario_text");
      if (initialInput) {
        initialInput.value = `${sd}/${sm}/${sy}`;
        initialInput.dispatchEvent(new Event("change"));
      }
      if (finalInput) {
        finalInput.value = `${ed}/${em}/${ey}`;
        finalInput.dispatchEvent(new Event("change"));
      }
      document.querySelector<HTMLElement>("#ctl00_MainContent_BtnBusqueda")?.click();
      resolve();
    }, 1000);
  });
}

async function fillRecibidasForm(year: number, month: number) {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const rdoFechas =
    document.getElementById("ctl00_MainContent_RdoFechas") ?? document.querySelector('input[value="RdoFechas"]');
  if (rdoFechas instanceof HTMLInputElement && !rdoFechas.checked) {
    rdoFechas.click();
    rdoFechas.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(2000);
  }
  let ddlAnio = document.getElementById("DdlAnio") as HTMLSelectElement | null;
  let ddlMes = document.getElementById("ctl00_MainContent_CldFecha_DdlMes") as HTMLSelectElement | null;
  if (!ddlAnio || !ddlMes) {
    (rdoFechas as HTMLElement | null)?.click();
    await wait(2000);
    ddlAnio = document.getElementById("DdlAnio") as HTMLSelectElement | null;
    ddlMes = document.getElementById("ctl00_MainContent_CldFecha_DdlMes") as HTMLSelectElement | null;
  }
  const select = async (el: HTMLSelectElement | null, value: string, ms: number) => {
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(ms);
  };
  await select(ddlAnio, String(year), 1000);
  await select(ddlMes, String(month), 1000);
  await select(document.getElementById("ctl00_MainContent_CldFecha_DdlDia") as HTMLSelectElement | null, "0", 500);
  const searchBtn = document.querySelector<HTMLElement>("#ctl00_MainContent_BtnBusqueda");
  searchBtn?.click();
  return !!searchBtn;
}

function readInvoiceTable(): PortalInvoice[] {
  const invoices: PortalInvoice[] = [];
  document.querySelectorAll("#ctl00_MainContent_tblResult tbody tr").forEach((row) => {
    const uuidCell = row.querySelector("td:nth-child(2) span");
    const xmlOnclick = row.querySelector('[onclick*="RecuperaCfdi.aspx"]')?.getAttribute("onclick");
    const pdfOnclick = row.querySelector('[onclick*="recuperaRepresentacionImpresa"]')?.getAttribute("onclick");
    if (!uuidCell || !xmlOnclick) return;
    invoices.push({
      uuid: uuidCell.textContent!.trim(),
      xmlUrl: xmlOnclick.match(/RecuperaCfdi\.aspx\?Datos=([^']+)/)?.[1] ?? null,
      pdfUrl: pdfOnclick?.match(/recuperaRepresentacionImpresa\('([^']+)'\)/)?.[1] ?? null,
    });
  });
  return invoices;
}

async function fetchXml(datos: string) {
  try {
    const resp = await fetch(`RecuperaCfdi.aspx?Datos=${datos}`);
    return { ok: resp.ok, content: await resp.text() };
  } catch (e) {
    return { ok: false, content: String(e) };
  }
}

async function fetchPdf(datos: string) {
  try {
    // El portal primero activa el token con un POST y luego sirve el PDF.
    await fetch(`RecuperaRepresentacionImpresa?Datos=${datos}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datos }),
    });
    const blob = await (await fetch(`RepresentacionImpresa.aspx?Datos=${datos}`)).blob();
    // Un Blob no cruza de contexto; se manda como data URL.
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { ok: true, dataUrl };
  } catch (e) {
    return { ok: false, dataUrl: String(e) };
  }
}

function showPageStatus(text: string, percent: number) {
  let box = document.getElementById("contabilizate-status");
  if (!box) {
    box = document.createElement("div");
    box.id = "contabilizate-status";
    box.style.cssText =
      "position:fixed;top:20px;right:20px;width:300px;z-index:999999;background:#fff;border:1px solid #e0e0e0;" +
      "border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);padding:15px;font:13px system-ui,sans-serif;color:#03301D";
    box.innerHTML =
      '<strong>Contabilizate · descargando</strong><div id="contabilizate-status-text" style="margin:8px 0;color:#555"></div>' +
      '<div style="height:8px;background:#eee;border-radius:4px;overflow:hidden"><div id="contabilizate-status-bar" style="height:100%;width:0;background:#86EE02;transition:width .3s"></div></div>';
    document.body.appendChild(box);
  }
  document.getElementById("contabilizate-status-text")!.textContent = text;
  (document.getElementById("contabilizate-status-bar") as HTMLElement).style.width = `${percent}%`;
}

function removePageStatus() {
  document.getElementById("contabilizate-status")?.remove();
}

// ── Orquestación (corre en la página de la app) ──

export async function downloadFromSat(
  request: DownloadRequest,
  onProgress: (p: DownloadProgress) => void,
  isCancelled: () => boolean,
): Promise<DownloadResult> {
  const url = QUERY_URL[request.type];
  const tab = await chrome.tabs.create({ url, active: true });
  const tabId = tab.id!;
  const result: DownloadResult = { uuids: [], failed: [] };
  let total = 0;

  const report = async (status: string, percent: number) => {
    onProgress({ status, percent: Math.round(percent), done: result.uuids.length, total });
    await run(tabId, showPageStatus, [status, Math.round(percent)]).catch(() => {});
  };
  const ensureActive = () => {
    if (isCancelled()) throw new DownloadCancelledError();
  };

  onProgress({ status: "Esperando el portal del SAT (inicia sesión si te lo pide)…", percent: 2, done: 0, total: 0 });
  await waitForQueryPage(tabId, url, isCancelled);

  try {
    await report("Preparando búsqueda…", 10);
    await delay(2000);

    const found: PortalInvoice[] = [];
    if (request.type === "recibidas") {
      // El portal solo busca recibidas por mes.
      const months = monthsBetween(request.startDate, request.endDate);
      for (const [i, { year, month }] of months.entries()) {
        ensureActive();
        await report(`Buscando facturas de ${month}/${year}…`, 10 + (i * 20) / months.length);
        await run(tabId, fillRecibidasForm, [year, month]);
        await delay(3000);
        found.push(...(await run(tabId, readInvoiceTable, [])));
      }
    } else {
      const [sy, sm, sd] = request.startDate.split("-");
      const [ey, em, ed] = request.endDate.split("-");
      await report("Buscando facturas emitidas…", 15);
      await run(tabId, fillEmitidasForm, [sd, sm, sy, ed, em, ey]);
      await delay(3000);
      found.push(...(await run(tabId, readInvoiceTable, [])));
    }

    const invoices = [...new Map(found.map((inv) => [inv.uuid, inv])).values()];
    total = invoices.length;
    if (total === 0) {
      await report("No se encontraron facturas en el rango", 100);
      return result;
    }

    const folder = `contabilizate/${request.type}`;
    for (const [i, invoice] of invoices.entries()) {
      ensureActive();
      await report(`Descargando ${i + 1}/${total}: ${invoice.uuid}`, 30 + (i * 70) / total);
      const xml = invoice.xmlUrl ? await run(tabId, fetchXml, [invoice.xmlUrl]) : null;
      if (!xml?.ok) {
        result.failed.push(invoice.uuid);
        continue;
      }
      await chrome.downloads.download({
        url: "data:text/xml;charset=utf-8," + encodeURIComponent(xml.content),
        filename: `${folder}/${invoice.uuid}.xml`,
        conflictAction: "overwrite",
      });
      if (request.includePdf && invoice.pdfUrl) {
        const pdf = await run(tabId, fetchPdf, [invoice.pdfUrl]);
        if (pdf.ok) {
          await chrome.downloads.download({ url: pdf.dataUrl, filename: `${folder}/${invoice.uuid}.pdf`, conflictAction: "overwrite" });
        }
      }
      result.uuids.push(invoice.uuid);
    }
    await report(`¡Listo! ${result.uuids.length} facturas descargadas`, 100);
    return result;
  } finally {
    setTimeout(() => run(tabId, removePageStatus, []).catch(() => {}), 5000);
  }
}
