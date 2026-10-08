import { useState } from "react";
import { FilePlus2, FolderOpen, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { forgetHandle, isFileSyncSupported, pickExistingSyncFile, pickNewSyncFile, type SyncFileHandle } from "@/lib/file-sync";
import { syncNow, updateSyncSettings } from "@/lib/sync";
import { summary, useSyncSettings } from "./drive-sync-card";

export function FileSyncCard() {
  const [stored, refresh] = useSyncSettings();
  const [busy, setBusy] = useState(false);
  const active = stored.enabled && stored.provider === "file";

  async function connect(pick: () => Promise<SyncFileHandle>) {
    setBusy(true);
    try {
      const handle = await pick();
      await updateSyncSettings({ provider: "file", fileName: handle.name, enabled: true, lastError: undefined });
      toast.success(`Sincronizado: ${summary(await syncNow({ interactive: true }))}`);
    } catch (err) {
      // Cerrar el selector sin elegir nada no es un error.
      if ((err as Error).name !== "AbortError") toast.error((err as Error).message);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function onSync() {
    setBusy(true);
    try {
      toast.success(`Sincronizado: ${summary(await syncNow({ interactive: true }))}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function onDisconnect() {
    if (!confirm("¿Dejar de sincronizar con el archivo? Tus datos y el archivo se quedan como están.")) return;
    await forgetHandle();
    await updateSyncSettings({ enabled: false, fileName: undefined, lastError: undefined });
    refresh();
    toast.success("Archivo desconectado");
  }

  if (!isFileSyncSupported()) return null;

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Archivo en una carpeta sincronizada
          <Badge variant={active ? "primary" : "secondary"}>{active ? "Activa" : "Desactivada"}</Badge>
        </CardTitle>
        <CardDescription>
          Sin cuentas ni permisos de Google. Elige un archivo dentro de una carpeta que ya sincronice iCloud, OneDrive,
          Dropbox o Syncthing: la extensión lo mantiene al día y tus otros navegadores hacen lo mismo con ese archivo.
          Incluye tu e.firma (cifrada), así que guárdalo solo en carpetas tuyas.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {active ? (
          <>
            <div className="text-sm">
              <p>
                Archivo: <span className="font-medium">{stored.fileName}</span>
              </p>
              {stored.lastSyncAt ? (
                <p>
                  Última sincronización: {new Date(stored.lastSyncAt).toLocaleString("es-MX")} ·{" "}
                  <span className="text-muted-foreground">{summary(stored.lastResult)}</span>
                </p>
              ) : (
                <p className="text-muted-foreground">Aún no se ha sincronizado.</p>
              )}
              {stored.lastError && <p className="mt-1 text-destructive">Último error: {stored.lastError}</p>}
            </div>
            <p className="text-xs text-muted-foreground">
              Se sincroniza al abrir la app, tras cada cambio y al volver a la pestaña. Si Chrome pierde el permiso al
              reiniciar, pulsa «Sincronizar ahora» para darlo otra vez.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={onSync} isLoading={busy}>
                <RefreshCw /> Sincronizar ahora
              </Button>
              <Button variant="ghost" onClick={onDisconnect}>
                <Unplug /> Desconectar
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => connect(pickNewSyncFile)} isLoading={busy}>
              <FilePlus2 /> Crear archivo
            </Button>
            <Button variant="outline" onClick={() => connect(pickExistingSyncFile)} disabled={busy}>
              <FolderOpen /> Elegir archivo existente
            </Button>
            <p className="text-xs text-muted-foreground">
              En el primer navegador crea el archivo; en los demás elige ese mismo archivo y se combinan los datos.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
