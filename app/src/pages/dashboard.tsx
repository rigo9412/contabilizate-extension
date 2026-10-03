import { useLiveQuery } from "dexie-react-hooks";
import { ExternalLink, FileText, KeyRound, LayoutTemplate } from "lucide-react";
import { Link } from "react-router-dom";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { alive, db, PROFILE_ID } from "@/lib/db";
import { openSatPortal } from "@/lib/sat";
import { useVaultStatus } from "@/lib/use-vault-status";

const VAULT_LABEL = {
  locked: "Bloqueada",
  session: "Desbloqueada (sesión)",
  remembered: "Desbloqueada (recordada)",
} as const;

export function DashboardPage() {
  const profile = useLiveQuery(() => db.profile.get(PROFILE_ID));
  const hasVault = useLiveQuery(async () => !!(await db.vault.get("efirma"))?.payload);
  const billCount = useLiveQuery(async () => alive(await db.bills.toArray()).length, [], 0);
  const templateCount = useLiveQuery(async () => alive(await db.templates.toArray()).length, [], 0);
  const vaultStatus = useVaultStatus();

  return (
    <>
      <PageTitle
        title={profile?.name ? `Hola, ${profile.name}` : "Bienvenido"}
        description="Tus datos viven en este navegador. Respáldalos desde la sección Respaldo."
      />

      {!profile && (
        <Card className="mb-6 border-accent">
          <CardHeader>
            <CardTitle>Configura tu perfil</CardTitle>
            <CardDescription>
              Agrega tu RFC y tu e.firma para iniciar sesión en el SAT automáticamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/profile">Ir a perfil</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={FileText} label="Facturas" value={billCount} />
        <StatCard icon={LayoutTemplate} label="Plantillas" value={templateCount} />
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <KeyRound className="size-4" /> e.firma
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasVault ? (
              <Badge variant={vaultStatus === "locked" ? "secondary" : "primary"}>
                {VAULT_LABEL[vaultStatus]}
              </Badge>
            ) : (
              <Badge variant="outline">Sin configurar</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Portal del SAT</CardTitle>
          <CardDescription>
            Con la e.firma desbloqueada, la extensión inicia sesión y llena la factura por ti.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={openSatPortal}>
            <ExternalLink /> Abrir portal de facturación
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <Icon className="size-4" /> {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-3xl font-bold">{value}</CardContent>
    </Card>
  );
}
