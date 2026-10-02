import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { RailContent, Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { CommandPaletteHost } from "@/components/shared/CommandPaletteHost";

export function AppShell() {
  const { profile, session } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Se a sessão já chegou mas o profile ainda está sendo carregado
  // (estado transiente após o signIn), mostra um loader em vez de
  // renderizar uma tela em branco.
  if (session && !profile) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!profile) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Skip-link (WCAG 2.4.1): visível só ao focar via teclado */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>

      {/* Menu lateral — desktop */}
      <div className="hidden md:flex">
        <Sidebar role={profile.role} />
      </div>

      {/* Menu lateral — mobile (gaveta) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="flex w-64 flex-col gap-0 border-none bg-rail p-2.5 text-rail-foreground"
        >
          <SheetTitle className="sr-only">Aplicação Professor</SheetTitle>
          <SheetDescription className="sr-only">
            Menu de navegação principal
          </SheetDescription>
          <RailContent
            role={profile.role}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onOpenMenu={() => setMobileOpen(true)} />

        <main
          className="flex-1 overflow-y-auto"
          id="main-content"
          tabIndex={-1}
        >
          {/* O PageHeader desfaz este padding para virar faixa — ver lá. */}
          <div className="px-5 pb-6 pt-5">
            <Outlet />
          </div>
        </main>
      </div>

      <CommandPaletteHost />
    </div>
  );
}

export default AppShell;
