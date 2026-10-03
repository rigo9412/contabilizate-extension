import { HashRouter, NavLink, Route, Routes } from "react-router-dom";
import { DatabaseBackup, Download, FileText, LayoutDashboard, LayoutTemplate, UserRound } from "lucide-react";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";
import { DashboardPage } from "@/pages/dashboard";
import { ProfilePage } from "@/pages/profile";
import { BackupPage } from "@/pages/backup";
import { BillEditPage } from "@/pages/bill-edit";
import { BillsPage } from "@/pages/bills";
import { DownloadsPage } from "@/pages/downloads";
import { TemplateEditPage } from "@/pages/template-edit";
import { TemplatesPage } from "@/pages/templates";

const NAV = [
  { to: "/", label: "Inicio", icon: LayoutDashboard },
  { to: "/bills", label: "Facturas", icon: FileText },
  { to: "/templates", label: "Plantillas", icon: LayoutTemplate },
  { to: "/downloads", label: "Descargar del SAT", icon: Download },
  { to: "/profile", label: "Perfil y e.firma", icon: UserRound },
  { to: "/backup", label: "Respaldo", icon: DatabaseBackup },
];

export function App() {
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
        <div className="flex flex-1 flex-col">
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
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/bills" element={<BillsPage />} />
              <Route path="/bills/new" element={<BillEditPage />} />
              <Route path="/bills/:id" element={<BillEditPage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/templates/new" element={<TemplateEditPage />} />
              <Route path="/templates/:id" element={<TemplateEditPage />} />
              <Route path="/downloads" element={<DownloadsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/backup" element={<BackupPage />} />
            </Routes>
          </main>
        </div>
      </div>
      <Toaster richColors position="top-right" />
    </HashRouter>
  );
}
