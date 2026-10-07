import { HashRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { CreditCard, DatabaseBackup, Download, FileText, Landmark, LayoutDashboard, LayoutTemplate, PiggyBank, UserRound } from "lucide-react";
import { Toaster } from "sonner";
import { ErrorBoundary } from "@/components/error-boundary";
import { useAutoSync } from "@/lib/use-auto-sync";
import { cn } from "@/lib/utils";
import { DashboardPage } from "@/pages/dashboard";
import { ProfilePage } from "@/pages/profile";
import { BackupPage } from "@/pages/backup";
import { BillEditPage } from "@/pages/bill-edit";
import { BillsPage } from "@/pages/bills";
import { CardAnalysisPage } from "@/pages/card-analysis";
import { CardsPage } from "@/pages/cards";
import { DeclarationPage } from "@/pages/declaration";
import { DownloadsPage } from "@/pages/downloads";
import { SavingsPlanPage } from "@/pages/savings-plan";
import { TemplateEditPage } from "@/pages/template-edit";
import { TemplatesPage } from "@/pages/templates";

const NAV = [
  { to: "/", label: "Inicio", icon: LayoutDashboard },
  { to: "/declaration", label: "Declaración mensual", icon: Landmark },
  { to: "/bills", label: "Facturas", icon: FileText },
  { to: "/templates", label: "Plantillas", icon: LayoutTemplate },
  { to: "/cards", label: "Tarjetas", icon: CreditCard },
  { to: "/savings", label: "Plan de ahorro", icon: PiggyBank },
  { to: "/downloads", label: "Descargar del SAT", icon: Download },
  { to: "/profile", label: "Perfil y e.firma", icon: UserRound },
  { to: "/backup", label: "Respaldo y sincronización", icon: DatabaseBackup },
];

export function App() {
  useAutoSync();
  return (
    <HashRouter>
      <div className="flex min-h-screen bg-secondary/40">
        <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r bg-background p-4 md:flex">
          <div className="mb-6 px-2 text-lg font-bold text-primary">Contabilizate</div>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary",
                  isActive && "bg-primary text-primary-foreground hover:bg-primary",
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <nav className="flex gap-1 overflow-x-auto border-b bg-background p-2 md:hidden">
            {NAV.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn("whitespace-nowrap rounded-md px-3 py-1.5 text-sm", isActive && "bg-primary text-primary-foreground")
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-8">
            <RouteErrorBoundary>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/declaration" element={<DeclarationPage />} />
              <Route path="/bills" element={<BillsPage />} />
              <Route path="/bills/new" element={<BillEditPage />} />
              <Route path="/bills/:id" element={<BillEditPage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/templates/new" element={<TemplateEditPage />} />
              <Route path="/templates/:id" element={<TemplateEditPage />} />
              <Route path="/cards" element={<CardsPage />} />
              <Route path="/cards/analysis" element={<CardAnalysisPage />} />
              <Route path="/savings" element={<SavingsPlanPage />} />
              <Route path="/downloads" element={<DownloadsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/backup" element={<BackupPage />} />
            </Routes>
            </RouteErrorBoundary>
          </main>
        </div>
      </div>
      <Toaster richColors position="top-right" />
    </HashRouter>
  );
}

/** Se reinicia al cambiar de pantalla, para que un error no bloquee el resto de la app. */
function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}
