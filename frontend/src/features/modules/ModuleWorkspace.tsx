import { Link, useLocation } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useModuleGrades } from "@/features/grades/useGrades";
import { useModuleAttendance } from "@/features/attendance/useAttendance";
import type { ModuleItem } from "./api";

/** Abas Notas / Chamada do módulo, com as contagens (cache das duas telas). */
export function ModuleTabs({ moduleId }: { moduleId: string }) {
  const { pathname } = useLocation();
  const { data: grades } = useModuleGrades(moduleId);
  const { data: history } = useModuleAttendance(moduleId);
  const tabs = [
    { to: "/grades", label: "Notas", count: grades?.length },
    { to: "/attendance", label: "Chamada", count: history?.length },
  ];
  return tabs.map((t) => {
    const active = pathname === t.to;
    return (
      <Link
        key={t.to}
        to={`${t.to}?module=${moduleId}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "whitespace-nowrap border-b-[2.5px] px-3 pb-[11px] pt-[9px] text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          active
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        {t.label}
        {t.count != null && (
          <span className="ml-[7px] font-mono text-[11px] font-medium text-muted-foreground">
            {t.count}
          </span>
        )}
      </Link>
    );
  });
}

/**
 * Coluna de módulos à esquerda (desktop largo) e seletor no lugar dela
 * (telas menores). `header` vem antes do seletor: o PageHeader precisa ser o
 * primeiro filho para as margens negativas funcionarem.
 */
export function ModuleWorkspace({
  modules,
  activeId,
  onSelect,
  header,
  children,
}: {
  modules: ModuleItem[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const showProfessor = useAuth().profile?.role !== "professor";

  return (
    <div className="-mx-5 -mb-6 -mt-5 flex">
      {modules.length > 0 && (
        <aside
          aria-label="Módulos do período"
          className="sticky top-0 hidden h-[calc(100vh-52px)] w-[250px] shrink-0 overflow-y-auto border-r bg-card px-3 pb-2.5 pt-3.5 lg:block"
        >
          <div className="flex items-baseline justify-between px-1 pb-2">
            <p className="text-[10.5px] font-bold uppercase tracking-[.11em] text-muted-foreground">
              Módulos
            </p>
            <span className="font-mono text-[11px] text-muted-foreground">{modules.length}</span>
          </div>
          {modules.map((m) => {
            const active = m.id === activeId;
            return (
              <button
                key={m.id}
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(m.id)}
                className={cn(
                  "mb-[5px] block w-full rounded-[10px] border px-[11px] py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-primary bg-accent" : "bg-card hover:border-foreground/30",
                )}
              >
                <span
                  className={cn(
                    "block font-mono text-[11.5px] font-semibold",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {m.code}
                </span>
                <span className="mt-[3px] block truncate text-[13px] font-semibold">{m.name}</span>
                {showProfessor && m.professor && (
                  <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                    {m.professor.full_name}
                  </span>
                )}
              </button>
            );
          })}
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col px-5 pb-6 pt-5">
        {header}
        {modules.length > 1 && (
          <Select value={activeId ?? ""} onValueChange={onSelect}>
            <SelectTrigger aria-label="Módulo" className="mb-3 bg-card lg:hidden">
              <SelectValue placeholder="Selecione um módulo" />
            </SelectTrigger>
            <SelectContent>
              {modules.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.code} — {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {children}
      </div>
    </div>
  );
}
