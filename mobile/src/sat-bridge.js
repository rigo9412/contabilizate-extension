/**
 * Puente de automatización sobre @capgo/capacitor-inappbrowser.
 *
 * Reemplaza a chrome.scripting.executeScript / chrome.tabs de la extensión.
 * El plugin expone executeScript() pero devuelve Promise<void>, así que el
 * resultado se regresa desde la página con window.mobileApp.postMessage()
 * y aquí se correlaciona por id para resolver la promesa correspondiente.
 */
import { InAppBrowser, InvisibilityMode, ToolBarType } from '@capgo/capacitor-inappbrowser';

// UA de Safari de escritorio: obliga al portal del SAT a servir su layout
// desktop, que es del que dependen los ids de DevExpress ya mapeados.
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/18.0 Safari/605.1.15';

const DEFAULT_TIMEOUT = 30000;

export class SatBridge {
  constructor() {
    this.webViewId = null;
    this.pending = new Map();
    this.seq = 0;
    this.listeners = [];
    this.lastLoadedUrl = null;
  }

  /** Abre el webview oculto y engancha los listeners. Idempotente. */
  async open(url) {
    if (this.webViewId) {
      await this.navigate(url);
      return this.webViewId;
    }

    const msgHandle = await InAppBrowser.addListener('messageFromWebview', (event) => {
      this._onMessage(event);
    });
    const loadHandle = await InAppBrowser.addListener('browserPageLoaded', () => {
      this._emitLoad();
    });
    this.listeners.push(msgHandle, loadHandle);

    const result = await InAppBrowser.openWebView({
      url,
      hidden: true,
      // FAKE_VISIBLE es obligatorio: con AWARE el webview reporta dimensiones
      // cero y DevExpress no renderiza ni considera "visibles" sus campos.
      invisibilityMode: InvisibilityMode.FAKE_VISIBLE,
      customUserAgent: DESKTOP_UA,
      toolbarType: ToolBarType.BLANK,
      isInspectable: true,
    });

    this.webViewId = result?.id ?? null;
    await this.waitForLoad();
    return this.webViewId;
  }

  /** Navega el webview ya abierto y espera a que termine de cargar. */
  async navigate(url) {
    const loaded = this.waitForLoad();
    await InAppBrowser.setUrl(this.webViewId ? { url, id: this.webViewId } : { url });
    await loaded;
  }

  /**
   * Ejecuta `fn` dentro de la página y devuelve su valor de retorno.
   * Equivalente a chrome.scripting.executeScript({ func, args }).
   */
  run(fn, args = [], timeout = DEFAULT_TIMEOUT) {
    const id = `sat-${++this.seq}`;
    const code = this._wrap(id, fn, args);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout (${timeout}ms) ejecutando script en la página`));
      }, timeout);

      this.pending.set(id, { resolve, reject, timer });

      const options = { code };
      if (this.webViewId) options.id = this.webViewId;

      InAppBrowser.executeScript(options).catch((err) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      });
    });
  }

  /** Inyecta un archivo del bundle. Equivalente a executeScript({ files }). */
  async runFile(path, timeout = DEFAULT_TIMEOUT) {
    const source = await fetch(path).then((r) => {
      if (!r.ok) throw new Error(`No se pudo leer ${path}: ${r.status}`);
      return r.text();
    });
    // El archivo se evalúa tal cual; si su última expresión es un valor, se devuelve.
    return this.run(new Function(`${source}`), [], timeout);
  }

  /** Espera el siguiente evento de carga completa de página. */
  waitForLoad(timeout = DEFAULT_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._loadResolver = null;
        reject(new Error(`Timeout (${timeout}ms) esperando la carga de la página`));
      }, timeout);

      this._loadResolver = () => {
        clearTimeout(timer);
        this._loadResolver = null;
        resolve();
      };
    });
  }

  /** Muestra el webview: necesario cuando el SAT pide captcha o intervención manual. */
  async show() {
    await InAppBrowser.show(this.webViewId ? { id: this.webViewId } : undefined);
  }

  async hide() {
    await InAppBrowser.hide(this.webViewId ? { id: this.webViewId } : undefined);
  }

  async close() {
    for (const handle of this.listeners) {
      await handle.remove();
    }
    this.listeners = [];
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error('El webview se cerró antes de recibir la respuesta'));
    }
    this.pending.clear();
    if (this.webViewId) {
      await InAppBrowser.close({ id: this.webViewId });
      this.webViewId = null;
    }
  }

  // --- internos -----------------------------------------------------------

  _emitLoad() {
    if (this._loadResolver) this._loadResolver();
  }

  _onMessage(event) {
    const detail = event?.detail;
    const id = detail?.__satReq;
    if (!id) return;

    const entry = this.pending.get(id);
    if (!entry) return;

    clearTimeout(entry.timer);
    this.pending.delete(id);

    if (detail.ok) {
      entry.resolve(detail.value);
    } else {
      entry.reject(new Error(detail.error || 'Error desconocido en la página'));
    }
  }

  _wrap(id, fn, args) {
    // Doble stringify: produce un literal de string válido que la página
    // vuelve a parsear, evitando problemas de escapado en los argumentos.
    const argsLiteral = JSON.stringify(JSON.stringify(args));
    const idLiteral = JSON.stringify(id);

    return `(async () => {
  var __id = ${idLiteral};
  var __post = function (payload) {
    payload.__satReq = __id;
    try {
      window.mobileApp.postMessage({ detail: payload });
    } catch (e) {
      console.error('[sat-bridge] no se pudo responder al host', e);
    }
  };
  try {
    var __fn = ${fn.toString()};
    var __args = JSON.parse(${argsLiteral});
    var __value = await __fn.apply(null, __args);
    __post({ ok: true, value: __value === undefined ? null : __value });
  } catch (e) {
    __post({ ok: false, error: String((e && e.message) || e) });
  }
})();`;
  }
}

export const bridge = new SatBridge();
