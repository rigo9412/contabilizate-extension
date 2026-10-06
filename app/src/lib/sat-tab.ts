// Utilidades para automatizar una pestaña del SAT desde la app: esperar a que
// el usuario inicie sesión, inyectar funciones y mostrar el avance en la página.

/** Tiempo máximo para que el usuario (o la e.firma desbloqueada) inicie sesión. */
export const LOGIN_TIMEOUT_MS = 3 * 60 * 1000;

export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Espera a que la pestaña termine de cargar una URL que cumpla `matches`. Si la
 * sesión expiró, el SAT la manda al login: ahí el script de inicio de sesión
 * entra solo si la e.firma está desbloqueada, o el usuario inicia sesión a mano.
 */
export function waitForTabUrl(
  tabId: number,
  matches: (url: string) => boolean,
  isCancelled: () => boolean,
  cancelledError: () => Error,
  timeoutMs = LOGIN_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearInterval(timer);
    };
    const check = (tab: chrome.tabs.Tab) => {
      if (tab.status === "complete" && tab.url && matches(tab.url)) {
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
        reject(cancelledError());
      } else if (Date.now() - started > timeoutMs) {
        cleanup();
        reject(new Error("No se inició sesión en el SAT a tiempo"));
      }
    }, 500);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.get(tabId).then(check, () => {});
  });
}

/** Inyecta `func` en el frame principal de la pestaña y regresa su resultado. */
export async function run<A extends unknown[], R>(tabId: number, func: (...args: A) => R, args: A): Promise<Awaited<R>> {
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return result.result as Awaited<R>;
}

// ── Funciones que se inyectan en el portal (no pueden usar nada de fuera) ──

export function showPageStatus(title: string, text: string, percent: number) {
  let box = document.getElementById("contabilizate-status");
  if (!box) {
    box = document.createElement("div");
    box.id = "contabilizate-status";
    box.style.cssText =
      "position:fixed;top:20px;right:20px;width:300px;z-index:999999;background:#fff;border:1px solid #e0e0e0;" +
      "border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);padding:15px;font:13px system-ui,sans-serif;color:#03301D";
    box.innerHTML =
      '<strong id="contabilizate-status-title"></strong><div id="contabilizate-status-text" style="margin:8px 0;color:#555"></div>' +
      '<div style="height:8px;background:#eee;border-radius:4px;overflow:hidden"><div id="contabilizate-status-bar" style="height:100%;width:0;background:#86EE02;transition:width .3s"></div></div>';
    document.body.appendChild(box);
  }
  document.getElementById("contabilizate-status-title")!.textContent = title;
  document.getElementById("contabilizate-status-text")!.textContent = text;
  (document.getElementById("contabilizate-status-bar") as HTMLElement).style.width = `${percent}%`;
}

export function removePageStatus() {
  document.getElementById("contabilizate-status")?.remove();
}
