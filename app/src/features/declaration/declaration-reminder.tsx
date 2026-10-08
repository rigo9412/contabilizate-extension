import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DeclarationReminder() {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.id) {
      setSupported(false);
      setLoading(false);
      return;
    }

    chrome.runtime.sendMessage({ type: "declaration-reminder:get" }, (result) => {
      if (chrome.runtime.lastError) {
        setSupported(false);
      } else {
        setEnabled(result?.enabled === true);
      }
      setLoading(false);
    });
  }, []);

  async function toggleReminder() {
    setLoading(true);
    try {
      if (!enabled) {
        const granted = await chrome.permissions.request({
          permissions: ["alarms", "notifications"],
        });
        if (!granted) {
          toast.error("Permite las notificaciones para activar el recordatorio.");
          return;
        }
      }

      const result = await chrome.runtime.sendMessage({
        type: enabled ? "declaration-reminder:disable" : "declaration-reminder:enable",
      });
      if (!result?.ok) throw new Error(result?.error ?? "No se pudo actualizar el recordatorio.");
      setEnabled(result.enabled === true);
      toast.success(result.enabled ? "Recordatorio mensual activado" : "Recordatorio mensual desactivado");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        {enabled ? <Bell className="mt-0.5 size-4 text-primary" /> : <BellOff className="mt-0.5 size-4 text-muted-foreground" />}
        <div>
          <p className="text-sm font-medium">Recordatorio para tu declaración</p>
          <p className="text-sm text-muted-foreground">
            {supported
              ? "Recibe una notificación el día 17 de cada mes a las 9:00 a. m. Puedes desactivarla cuando quieras."
              : "Disponible al usar Contabilizate como extensión de Chrome."}
          </p>
        </div>
      </div>
      {supported && (
        <Button variant="outline" size="sm" disabled={loading} onClick={toggleReminder}>
          {enabled ? "Desactivar" : "Activar recordatorio"}
        </Button>
      )}
    </div>
  );
}
