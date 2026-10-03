import { useEffect, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db, PROFILE_ID, save, VAULT_ID } from "@/lib/db";
import { RFC_REGEX } from "@/lib/sat";
import type { Profile } from "@/lib/types";
import { useVaultStatus } from "@/lib/use-vault-status";
import { lockVault, saveVault, unlockVault } from "@/lib/vault";

const EMPTY_PROFILE = { name: "", rfc: "", postalCode: "", regimenFiscal: "" };

export function ProfilePage() {
  return (
    <>
      <PageTitle title="Perfil y e.firma" description="Datos fiscales del emisor y certificados para el SAT." />
      <div className="grid gap-6">
        <ProfileForm />
        <VaultCard />
      </div>
    </>
  );
}

function ProfileForm() {
  const stored = useLiveQuery(() => db.profile.get(PROFILE_ID));
  const [form, setForm] = useState(EMPTY_PROFILE);

  useEffect(() => {
    if (stored) setForm({ name: stored.name, rfc: stored.rfc, postalCode: stored.postalCode, regimenFiscal: stored.regimenFiscal });
  }, [stored]);

  const set = (field: keyof typeof EMPTY_PROFILE) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const rfc = form.rfc.trim().toUpperCase();
    if (!RFC_REGEX.test(rfc)) {
      toast.error("Formato de RFC inválido");
      return;
    }
    await save<Profile>(db.profile, { id: PROFILE_ID, ...form, rfc });
    // El script de inicio de sesión del SAT lee el RFC de aquí.
    await chrome.storage.local.set({ rfc });
    toast.success("Perfil guardado");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos fiscales</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre o razón social">
            <Input value={form.name} onChange={set("name")} required />
          </Field>
          <Field label="RFC">
            <Input value={form.rfc} onChange={set("rfc")} className="uppercase" required />
          </Field>
          <Field label="Código postal">
            <Input value={form.postalCode} onChange={set("postalCode")} inputMode="numeric" maxLength={5} />
          </Field>
          <Field label="Régimen fiscal">
            <Input value={form.regimenFiscal} onChange={set("regimenFiscal")} placeholder="626 - RESICO" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Guardar perfil</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function VaultCard() {
  const vault = useLiveQuery(() => db.vault.get(VAULT_ID));
  const status = useVaultStatus();
  const [cer, setCer] = useState<File | null>(null);
  const [key, setKey] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [unlockPassword, setUnlockPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!cer || !key || !password) return;
    setBusy(true);
    try {
      await saveVault(cer, key, password);
      await unlockVault(password, false);
      setPassword("");
      toast.success("e.firma guardada y cifrada");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onUnlock(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await unlockVault(unlockPassword, remember);
      setUnlockPassword("");
      toast.success("e.firma desbloqueada");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          e.firma
          {vault && (
            <Badge variant={status === "locked" ? "secondary" : "primary"}>
              {status === "locked" ? "Bloqueada" : "Desbloqueada"}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Se guarda cifrada con la contraseña de tu e.firma. Desbloquéala una vez por sesión para que la
          extensión inicie sesión en el SAT.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {vault && (
          <div className="flex flex-wrap items-end gap-3">
            {status === "locked" ? (
              <form onSubmit={onUnlock} className="flex flex-wrap items-end gap-3">
                <Field label="Contraseña de la e.firma">
                  <Input type="password" value={unlockPassword} onChange={(e) => setUnlockPassword(e.target.value)} required />
                </Field>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  Mantener desbloqueada en este equipo
                </label>
                <Button type="submit" isLoading={busy}>
                  <Unlock /> Desbloquear
                </Button>
              </form>
            ) : (
              <Button variant="outline" onClick={() => lockVault().then(() => toast.success("e.firma bloqueada"))}>
                <Lock /> Bloquear
              </Button>
            )}
            <p className="w-full text-xs text-muted-foreground">
              Archivos: {vault.cerFileName} · {vault.keyFileName}
            </p>
          </div>
        )}

        <form onSubmit={onSave} className="grid gap-4 border-t pt-6 sm:grid-cols-3">
          <p className="text-sm font-medium sm:col-span-3">{vault ? "Reemplazar e.firma" : "Cargar e.firma"}</p>
          <Field label="Certificado (.cer)">
            <Input type="file" accept=".cer" onChange={(e) => setCer(e.target.files?.[0] ?? null)} required />
          </Field>
          <Field label="Llave privada (.key)">
            <Input type="file" accept=".key" onChange={(e) => setKey(e.target.files?.[0] ?? null)} required />
          </Field>
          <Field label="Contraseña">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <div className="sm:col-span-3">
            <Button type="submit" isLoading={busy}>Guardar e.firma</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
