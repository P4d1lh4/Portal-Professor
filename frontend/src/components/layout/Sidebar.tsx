import { NavLink } from "react-router-dom";
import {
  BookOpen,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Upload,
  Users,
  CalendarRange,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "coordinator", "professor"],
  },
  {
    label: "Usuários",
    to: "/users",
    icon: Users,
    roles: ["admin"],
  },
  {
    label: "Períodos Acadêmicos",
    to: "/periods",
    icon: CalendarRange,
    roles: ["admin", "coordinator"],
  },
  {
    label: "Módulos",
    to: "/modules",
    icon: BookOpen,
    roles: ["coordinator", "professor"],
  },
  {
    label: "Alunos",
    to: "/students",
    icon: GraduationCap,
    roles: ["coordinator", "professor"],
  },
  {
    label: "Lançar Notas",
    to: "/grades",
    icon: ClipboardList,
    roles: ["coordinator", "professor"],
  },
  {
    label: "Importação",
    to: "/import",
    icon: Upload,
    roles: ["coordinator", "admin"],
  },
];

interface SidebarNavProps {
  role: UserRole;
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function SidebarNav({ role, collapsed, onNavigate }: SidebarNavProps) {
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <nav aria-label="Menu principal">
      <ul className="space-y-0.5 px-2">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-primary/10 text-primary dark:bg-primary/20"
                    : "text-muted-foreground"
                )
              }
            >
              <item.icon
                className="h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              {!collapsed && (
                <span className="truncate">{item.label}</span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

interface SidebarProps {
  role: UserRole;
  collapsed: boolean;
}

export function Sidebar({ role, collapsed }: SidebarProps) {
  return (
    <aside
      aria-label="Barra lateral"
      className={cn(
        "flex h-full flex-col border-r bg-card transition-all duration-300",
        collapsed ? "w-14" : "w-60"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex h-14 items-center border-b px-3",
          collapsed ? "justify-center" : "gap-2 px-4"
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GraduationCap className="h-4 w-4" />
        </div>
        {!collapsed && (
          <span className="font-semibold text-sm leading-tight truncate">
            Aplicação Professor
          </span>
        )}
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-4">
        <SidebarNav role={role} collapsed={collapsed} />
      </div>
    </aside>
  );
}
