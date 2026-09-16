import { Menu, Search } from "lucide-react";

import { Button } from "@/components/ui/button";

interface TopbarProps {
  /** Abre o menu lateral no celular (no desktop ele fica sempre à mão). */
  onOpenMenu: () => void;
}

export function Topbar({ onOpenMenu }: TopbarProps) {
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b bg-card px-5">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onOpenMenu}
        aria-label="Abrir menu"
      >
        <Menu className="h-4 w-4" />
      </Button>

      <button
        type="button"
        className="relative ml-auto flex h-9 w-[210px] max-w-full items-center rounded-lg border bg-card pl-[34px] pr-[52px] text-[13.5px] text-muted-foreground transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() =>
          document.dispatchEvent(new CustomEvent("command-palette:open"))
        }
        aria-label="Abrir paleta de comandos"
      >
        <Search
          className="absolute left-[11px] top-1/2 h-[15px] w-[15px] -translate-y-1/2"
          aria-hidden="true"
        />
        Pesquisar…
        <kbd className="absolute right-[9px] top-1/2 -translate-y-1/2 rounded-[5px] border px-[5px] py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>
    </header>
  );
}
