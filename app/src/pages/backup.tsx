import { useState, type FormEvent } from "react";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DriveSyncCard } from "@/features/sync/drive-sync-card";
import { FileSyncCard } from "@/features/sync/file-sync-card";
import { backupFileName, BackupNeedsPasswordError, exportBackup, importBackup } from "@/lib/backup";

export function BackupPage() {
  return (
    <>
      <PageTitle
        title="Respaldo y sincronización"
        description="Sincroniza tus datos con Google Drive, con un archivo en una carpeta que ya sincronizas, o expórtalos a un archivo para restaurarlos en otro navegador."
      />
      <div className="grid gap-6 md:grid-cols-2">
        <DriveSyncCard />
        <FileSyncCard />
        <ExportCard />
        <ImportCard />
      </div>
    </>
  );
}

function ExportCard() {
  const [password, setPassword] = useState("");
  const [includeVault, setIncludeVault] = useState(true);
  const [busy, setBusy] = useState(false);

  async function onExport(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const blob = await exportBackup({ password: password || undefined, includeVault });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = backupFileName();
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Respaldo exportado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exportar</CardTitle>
        <CardDescription>Descarga un archivo .json con facturas, plantillas, perfil y e.firma.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onExport} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Contraseña del respaldo (opcional)</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Si la pones, todo el archivo se cifra. La e.firma siempre va cifrada con su propia contraseña.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeVault} onChange={(e) => setIncludeVault(e.target.checked)} />
            Incluir e.firma
          </label>
          <Button type="submit" isLoading={busy}>
            <Download /> Exportar respaldo
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ImportCard() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onImport(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      const { added, updated } = await importBackup(file, password || undefined);
      setNeedsPassword(false);
      toast.success(`Respaldo importado: ${added} nuevos, ${updated} actualizados`);
    } catch (err) {
      if (err instanceof BackupNeedsPasswordError) setNeedsPassword(true);
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importar</CardTitle>
        <CardDescription>
          Se combina con lo que ya tienes: si un registro existe en ambos lados, se queda el más reciente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onImport} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Archivo de respaldo</Label>
            <Input type="file" accept=".json,application/json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
          </div>
          {needsPassword && (
            <div className="grid gap-1.5">
              <Label>Contraseña del respaldo</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          )}
          <Button type="submit" isLoading={busy}>
            <Upload /> Importar respaldo
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
