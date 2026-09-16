import { NavLink, useNavigate } from "react-router-dom";
import {
  BookOpen,
  CalendarCheck,
  CalendarRange,
  ClipboardList,
  GraduationCap,
  History,
  LayoutDashboard,
  LogOut,
  Moon,
  Sun,
  Upload,
  User,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { cn, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserRole } from "@/types";

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  prefetch?: () => Promise<unknown>;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Visão geral",
    to: "/dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "coordinator", "professor"],
    prefetch: () => import("@/features/dashboard/DashboardPage"),
  },
  {
    label: "Notas e faltas",
    to: "/grades",
    icon: ClipboardList,
    roles: ["coordinator", "professor"],
    prefetch: () => import("@/features/grades/GradesPage"),
  },
  {
    label: "Chamada",
    to: "/attendance",
    icon: CalendarCheck,
    roles: ["coordinator", "professor"],
    prefetch: () => import("@/features/attendance/AttendancePage"),
  },
  {
    label: "Alunos",
    to: "/students",
    icon: GraduationCap,
    roles: ["coordinator", "professor"],
    prefetch: () => import("@/features/students/StudentsPage"),
  },
  {
    label: "Módulos",
    to: "/modules",
    icon: BookOpen,
    roles: ["coordinator", "professor"],
    prefetch: () => import("@/features/modules/ModulesPage"),
  },
  {
    label: "Períodos",
    to: "/periods",
    icon: CalendarRange,
    roles: ["admin", "coordinator"],
    prefetch: () => import("@/features/periods/PeriodsPage"),
  },
  {
    label: "Importação",
    to: "/import",
    icon: Upload,
    roles: ["coordinator", "admin"],
    prefetch: () => import("@/features/import/ImportPage"),
  },
  {
    label: "Usuários",
    to: "/users",
    icon: Users,
    roles: ["admin"],
    prefetch: () => import("@/features/users/UsersPage"),
  },
  {
    label: "Auditoria",
    to: "/audit-log",
    icon: History,
    roles: ["admin"],
    prefetch: () => import("@/features/audit/AuditLogPage"),
  },
];

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrador",
  coordinator: "Coordenador",
  professor: "Professor",
};

// O menu é escuro nos dois temas (--rail), então o texto dele é branco fixo.
const ITEM =
  "flex h-11 w-full items-center gap-3 rounded-[11px] px-3 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60";
const IDLE = "text-white/60 hover:bg-white/[.07] hover:text-white";
// Menu recolhido: o rótulo só aparece quando ele expande (hover ou foco).
const FADE =
  "opacity-0 transition-opacity group-hover/rail:opacity-100 group-focus-within/rail:opacity-100";

interface RailContentProps {
  role: UserRole;
  /** Menu recolhível do desktop; a gaveta do celular mostra os rótulos sempre. */
  rail?: boolean;
  onNavigate?: () => void;
}

export function RailContent({ role, rail, onNavigate }: RailContentProps) {
  const fade = rail ? FADE : undefined;
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <>
      <div className="mb-2.5 flex h-11 shrink-0 items-center gap-3 px-1">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
          <GraduationCap className="h-[18px] w-[18px]" />
        </span>
        <span className={cn("whitespace-nowrap text-[13.5px] font-semibold text-white", fade)}>
          Aplicação Professor
        </span>
      </div>

      <nav
        aria-label="Menu principal"
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <p
          className={cn(
            "mb-1.5 whitespace-nowrap px-2 text-[10px] font-bold uppercase tracking-[.13em] text-white/45",
            fade,
          )}
        >
          Acadêmico
        </p>
        <ul className="space-y-0.5">
          {items.map((item) => {
            const prefetch = () => {
              item.prefetch?.().catch(() => {
                /* prefetch é best-effort; ignora falhas */
              });
            };
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onNavigate}
                  onMouseEnter={prefetch}
                  onFocus={prefetch}
                  className={({ isActive }) =>
                    cn(ITEM, isActive ? "bg-primary text-primary-foreground" : IDLE)
                  }
                >
                  <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className={cn("truncate", fade)}>{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <RailFooter fade={fade} onNavigate={onNavigate} />
    </>
  );
}

function RailFooter({ fade, onNavigate }: { fade?: string; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();

  if (!profile) return null;

  const dark = resolvedTheme === "dark";
  const handleSignOut = () => {
    // Navega imediatamente; signOut limpa o estado sync e faz cleanup local
    // em background — não bloqueamos a UI esperando rede.
    void signOut();
    toast.success("Até logo!");
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex shrink-0 flex-col gap-0.5 pt-1.5">
      <button
        type="button"
        className={cn(ITEM, IDLE)}
        onClick={() => setTheme(dark ? "light" : "dark")}
      >
        {dark ? (
          <Sun className="h-5 w-5 shrink-0" aria-hidden="true" />
        ) : (
          <Moon className="h-5 w-5 shrink-0" aria-hidden="true" />
        )}
        <span className={cn("truncate", fade)}>
          {dark ? "Tema claro" : "Tema escuro"}
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(ITEM, IDLE, "px-1")}
            aria-label="Menu do usuário"
          >
            <Avatar className="h-9 w-9">
              {profile.avatar_url && (
                <AvatarImage src={profile.avatar_url} alt={profile.full_name} />
              )}
              <AvatarFallback className="bg-white/10 text-xs text-white/85">
                {initials(profile.full_name)}
              </AvatarFallback>
            </Avatar>
            <span className={cn("min-w-0 text-left", fade)}>
              <span className="block truncate text-[12.5px] text-white">
                {profile.full_name}
              </span>
              <span className="block truncate text-[11px] font-normal text-white/60">
                {ROLE_LABEL[profile.role]}
              </span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-52">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">
                {profile.full_name}
              </p>
              <p className="text-xs leading-none text-muted-foreground">
                {profile.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              onNavigate?.();
              navigate("/profile");
            }}
          >
            <User />
            Meu perfil
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={handleSignOut}
          >
            <LogOut />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function Sidebar({ role }: { role: UserRole }) {
  return (
    <>
      {/* Reserva a largura do menu recolhido; expandido, ele passa por cima do conteúdo. */}
      <div className="w-16 shrink-0" aria-hidden="true" />
      <aside
        aria-label="Barra lateral"
        className="group/rail fixed inset-y-0 left-0 z-40 flex w-16 flex-col overflow-hidden bg-rail px-2.5 py-3 transition-[width,box-shadow] duration-200 hover:w-[218px] hover:shadow-[18px_0_44px_rgba(0,0,0,.35)] focus-within:w-[218px] focus-within:shadow-[18px_0_44px_rgba(0,0,0,.35)] motion-reduce:transition-none"
      >
        <RailContent role={role} rail />
      </aside>
    </>
  );
}
