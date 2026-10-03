import { useCallback, useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { disconnect, isDriveConfigured } from "@/lib/drive";
import { getSyncSettings, syncNow, updateSyncSettings, type SyncSettings } from "@/lib/sync";

function useSyncSettings() {
  const [settings, setSettings] = useState<SyncSettings>({ enabled: false });
  const refresh = useCallback(() => {
    getSyncSettings().then(setSettings);
  }, []);
  useEffect(() => {
    refresh();
    chrome.storage.onChanged.addListener(refresh);
    return () => chrome.storage.onChanged.removeListener(refresh);
  }, [refresh]);
  return [settings, refresh] as const;
}

const summary = (r?: { added: number; updated: number }) =>
  !r || r.added + r.updated === 0 ? "sin cambios de otros dispositivos" : `${r.added} nuevos y ${r.updated} actualizados desde Drive`;

export function DriveSyncCard() {
  const [settings, refresh] = useSyncSettings();
  const [busy, setBusy] = useState(false);

  async function onSync(interactive: boolean) {
    setBusy(true);
    try {
      const result = await syncNow({ interactive });
      if (!settings.enabled) await updateSyncSettings({ enabled: true });
      toast.success(`Sincronizado: ${summary(result)}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function onDisconnect() {
    if (!confirm("¿Dejar de sincronizar? Tus datos se quedan en este navegador y en Drive.")) return;
    await disconnect();
    await updateSyncSettings({ enabled: false, lastError: undefined });
    refresh();
    toast.success("Google Drive desconectado");
  }

  if (!isDriveConfigured()) return <SetupInstructions />;

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Google Drive
          <Badge variant={settings.enabled ? "primary" : "secondary"}>{settings.enabled ? "Activa" : "Desactivada"}</Badge>
        </CardTitle>
        <CardDescription>
          Sincroniza facturas, plantillas, perfil y e.firma (cifrada) entre tus navegadores. Se guarda en la carpeta
          oculta de la app en tu Drive: no aparece entre tus archivos y solo esta extensión puede leerla.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {settings.enabled ? (
          <>
            <div className="text-sm">
              {settings.lastSyncAt ? (
                <p>
                  Última sincronización: {new Date(settings.lastSyncAt).toLocaleString("es-MX")} ·{" "}
                  <span className="text-muted-foreground">{summary(settings.lastResult)}</span>
                </p>
              ) : (
                <p className="text-muted-foreground">Aún no se ha sincronizado.</p>
              )}
              {settings.lastError && <p className="mt-1 text-destructive">Último error: {settings.lastError}</p>}
            </div>
            <p className="text-xs text-muted-foreground">
              Se sincroniza sola al abrir la app, unos segundos después de cada cambio y al volver a esta pestaña.
            </p>
            <div className="flex flex-wrap gap-2">
              {/* Interactivo por si el permiso de Google venció o se revocó. */}
              <Button onClick={() => onSync(true)} isLoading={busy}>
                <RefreshCw /> Sincronizar ahora
              </Button>
              <Button variant="ghost" onClick={onDisconnect}>
                <CloudOff /> Desconectar
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => onSync(true)} isLoading={busy}>
              Conectar con Google Drive
            </Button>
            <p className="text-xs text-muted-foreground">
              Usa la cuenta de Google con la que iniciaste sesión en Chrome. Si ya tienes datos en Drive de otro
              navegador, se combinan con los de aquí.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SetupInstructions() {
  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle>Google Drive (falta configurar)</CardTitle>
        <CardDescription>
          Para sincronizar, la extensión necesita un Client ID de Google. Se crea una sola vez y es gratis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid list-decimal gap-1 pl-5 text-sm">
          <li>
            En <span className="font-medium">console.cloud.google.com</span> crea un proyecto y habilita la{" "}
            <span className="font-medium">Google Drive API</span>.
          </li>
          <li>
            En "Pantalla de consentimiento de OAuth" elige <span className="font-medium">Externo</span>, y en usuarios de
            prueba agrega tu cuenta de Gmail.
          </li>
          <li>
            En "Credenciales" crea un <span className="font-medium">ID de cliente de OAuth</span> de tipo{" "}
            <span className="font-medium">Extensión de Chrome</span> con este ID de elemento:
            <code className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-xs">{chrome.runtime.id}</code>
          </li>
          <li>
            Copia el Client ID a un archivo <code className="rounded bg-secondary px-1 text-xs">.env</code> en la raíz del
            proyecto: <code className="rounded bg-secondary px-1 text-xs">VITE_GOOGLE_CLIENT_ID=…</code>
          </li>
          <li>
            Corre <code className="rounded bg-secondary px-1 text-xs">npm run build</code> y recarga la extensión.
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}
