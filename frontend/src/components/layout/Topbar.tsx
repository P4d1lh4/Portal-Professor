import { useNavigate } from "react-router-dom";
import { Menu, Moon, Sun, LogOut, User, Search } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  coordinator: "Coordenador",
  professor: "Professor",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

interface TopbarProps {
  onToggleSidebar: () => void;
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  const handleSignOut = () => {
    // Navega imediatamente; signOut limpa o estado sync e faz cleanup local
    // em background — não bloqueamos a UI esperando rede.
    void signOut();
    toast.success("Até logo!");
    navigate("/login", { replace: true });
  };

  if (!profile) return null;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4">
      {/* Esquerda: toggle sidebar */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSidebar}
        aria-label="Alternar barra lateral"
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Centro: hint Cmd+K */}
      <button
        className="hidden sm:flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
        onClick={() =>
          document.dispatchEvent(new CustomEvent("command-palette:open"))
        }
        aria-label="Abrir paleta de comandos"
      >
        <Search className="h-3 w-3" />
        Pesquisar…
        <kbd className="ml-1 rounded bg-background px-1.5 py-0.5 font-mono text-[10px] border">
          ⌘K
        </kbd>
      </button>

      {/* Direita: tema + perfil */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Menu do usuário"
            >
              <Avatar className="h-7 w-7">
                {profile.avatar_url && (
                  <AvatarImage src={profile.avatar_url} alt={profile.full_name} />
                )}
                <AvatarFallback className="text-xs">
                  {getInitials(profile.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden flex-col text-left sm:flex">
                <span className="text-xs font-medium leading-tight">
                  {profile.full_name}
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  {ROLE_LABEL[profile.role] ?? profile.role}
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
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
            <DropdownMenuItem onClick={() => navigate("/profile")}>
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
    </header>
  );
}
