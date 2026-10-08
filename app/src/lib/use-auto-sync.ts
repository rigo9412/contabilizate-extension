import { useEffect } from "react";
import { db, SYNC_TABLES } from "./db";
import { getSyncSettings, isSyncing, syncNow } from "./sync";

/** Espera tras el último cambio antes de subirlo, para juntar ediciones seguidas. */
const CHANGE_DEBOUNCE_MS = 10_000;
/** Al volver a la pestaña, sincroniza si la última vez fue hace más de esto. */
const STALE_MS = 2 * 60_000;

/**
 * Sincroniza (Drive o archivo) al abrir la app, unos segundos después de cada cambio
 * local y al volver a la pestaña. Nunca abre la ventana de Google: si falta
 * permiso, el error queda en la configuración y se muestra en Respaldo.
 */
export function useAutoSync() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if ((await getSyncSettings()).enabled) syncNow().catch(() => {});
    };
    const schedule = () => {
      // Los cambios que hace la propia sincronización al combinar no cuentan.
      if (isSyncing()) return;
      clearTimeout(timer);
      timer = setTimeout(run, CHANGE_DEBOUNCE_MS);
    };
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      const { enabled, lastSyncAt = 0 } = await getSyncSettings();
      if (enabled && Date.now() - lastSyncAt > STALE_MS) syncNow().catch(() => {});
    };

    run();
    const tables = SYNC_TABLES.map((name) => db.table(name));
    for (const table of tables) {
      table.hook("creating", schedule);
      table.hook("updating", schedule);
      table.hook("deleting", schedule);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      for (const table of tables) {
        table.hook("creating").unsubscribe(schedule);
        table.hook("updating").unsubscribe(schedule);
        table.hook("deleting").unsubscribe(schedule);
      }
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
