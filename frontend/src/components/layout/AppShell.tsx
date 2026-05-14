import { useState } from "react";
import { Outlet } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SidebarNav } from "./Sidebar";
import { CommandPalette } from "@/components/shared/CommandPalette";

export function AppShell() {
  const { profile } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!profile) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar — desktop */}
      <div className="hidden md:flex md:flex-col">
        <Sidebar role={profile.role} collapsed={collapsed} />
      </div>

      {/* Sidebar — mobile (drawer) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex h-14 items-center gap-2 border-b px-4">
            <span className="font-semibold text-sm">Aplicação Professor</span>
          </div>
          <div className="py-4">
            <SidebarNav
              role={profile.role}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          onToggleSidebar={() => {
            // Em mobile abre o drawer; em desktop colapsa a sidebar
            if (window.innerWidth < 768) {
              setMobileOpen(true);
            } else {
              setCollapsed((v) => !v);
            }
          }}
        />

        <main
          className="flex-1 overflow-y-auto"
          id="main-content"
          tabIndex={-1}
        >
          <div className="container mx-auto p-6">
            <Outlet />
          </div>
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}
