import { useNavigate } from "react-router-dom";
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
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types";

interface CommandEntry {
  label: string;
  icon: React.ElementType;
  action: () => void;
  roles: UserRole[];
  keywords?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const role = profile?.role as UserRole | undefined;

  const go = (path: string) => {
    navigate(path);
    onOpenChange(false);
  };

  const navItems: CommandEntry[] = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      action: () => go("/dashboard"),
      roles: ["admin", "coordinator", "professor"],
    },
    {
      label: "Períodos Acadêmicos",
      icon: CalendarRange,
      action: () => go("/periods"),
      roles: ["admin", "coordinator"],
    },
    {
      label: "Módulos",
      icon: BookOpen,
      action: () => go("/modules"),
      roles: ["coordinator", "professor"],
    },
    {
      label: "Alunos",
      icon: GraduationCap,
      action: () => go("/students"),
      roles: ["coordinator", "professor"],
      keywords: "aluno matricula",
    },
    {
      label: "Lançar Notas",
      icon: ClipboardList,
      action: () => go("/grades"),
      roles: ["coordinator", "professor"],
      keywords: "notas faltas grade",
    },
    {
      label: "Chamada",
      icon: CalendarCheck,
      action: () => go("/attendance"),
      roles: ["coordinator", "professor"],
      keywords: "chamada frequencia presenca falta",
    },
    {
      label: "Importação CSV",
      icon: Upload,
      action: () => go("/import"),
      roles: ["coordinator", "admin"],
      keywords: "importar csv upload",
    },
    {
      label: "Usuários",
      icon: Users,
      action: () => go("/users"),
      roles: ["admin"],
    },
    {
      label: "Auditoria",
      icon: History,
      action: () => go("/audit-log"),
      roles: ["admin"],
      keywords: "audit log historico alteracoes",
    },
  ];

  const actionItems: CommandEntry[] = [
    {
      label: theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro",
      icon: theme === "dark" ? Sun : Moon,
      action: () => {
        setTheme(theme === "dark" ? "light" : "dark");
        onOpenChange(false);
      },
      roles: ["admin", "coordinator", "professor"],
    },
    {
      label: "Sair",
      icon: LogOut,
      action: async () => {
        onOpenChange(false);
        await signOut();
        toast.success("Até logo!");
        navigate("/login", { replace: true });
      },
      roles: ["admin", "coordinator", "professor"],
    },
  ];

  const visible = (items: CommandEntry[]) =>
    role ? items.filter((i) => i.roles.includes(role)) : [];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Pesquisar página ou ação…" />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        <CommandGroup heading="Navegar">
          {visible(navItems).map((item) => (
            <CommandItem
              key={item.label}
              onSelect={item.action}
              keywords={item.keywords ? [item.keywords] : undefined}
            >
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Ações">
          {visible(actionItems).map((item) => (
            <CommandItem key={item.label} onSelect={item.action}>
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export { Command };
export default CommandPalette;
