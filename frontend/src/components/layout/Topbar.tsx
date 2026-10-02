import { CalendarRange, Menu, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSelectedPeriod } from "@/features/periods/useSelectedPeriod";
import { useModules } from "@/features/modules/useModules";

interface TopbarProps {
  /** Abre o menu lateral no celular (no desktop ele fica sempre à mão). */
  onOpenMenu: () => void;
}

const dayMonth = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

/** Período da barra: vale para todas as telas (ver useSelectedPeriod). */
function PeriodPicker() {
  const { periods, period, periodId, setPeriodId, isLoading } = useSelectedPeriod();
  const { data: modules } = useModules(periodId, !isLoading && !!periodId);
  if (!period) return null;

  const facts = [
    modules && `${modules.length} módulo${modules.length !== 1 ? "s" : ""}`,
    !period.is_active
      ? "encerrado"
      : period.end_date && `encerra ${dayMonth(period.end_date)}`,
  ].filter(Boolean);

  return (
    <>
      <Select value={periodId} onValueChange={setPeriodId}>
        <SelectTrigger
          aria-label="Período"
          className="h-9 w-auto max-w-[240px] shrink-0 gap-2 bg-card font-semibold shadow-none hover:border-foreground/40"
        >
          <CalendarRange className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {periods.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
              {!p.is_active && " (encerrado)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {facts.length > 0 && (
        <span className="hidden truncate text-[12.5px] text-muted-foreground lg:inline">
          {facts.join(" · ")}
        </span>
      )}
    </>
  );
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

      <PeriodPicker />

      <button
        type="button"
        className="relative ml-auto flex h-9 w-[210px] max-w-full shrink-0 items-center rounded-lg border bg-card pl-[34px] pr-[52px] text-[13.5px] text-muted-foreground transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:w-9 max-sm:px-0 max-sm:text-[0px]"
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
        <kbd className="absolute right-[9px] top-1/2 -translate-y-1/2 rounded-[5px] border px-[5px] py-0.5 font-mono text-[10px] max-sm:hidden">
          ⌘K
        </kbd>
      </button>
    </header>
  );
}
