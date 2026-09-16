import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, ChevronDown, ChevronUp, History } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { FilterChips, type FilterChipOption } from "@/components/shared/FilterChips";
import { badgeVariants } from "@/components/ui/badge";
import { Pagination } from "@/components/shared/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { useAuditLog } from "./useAudit";
import type { AuditAction, AuditLogEntry } from "./api";

const PAGE_SIZE = 25;

const ENTITY_LABELS: Record<string, string> = {
  grades: "Notas",
  students: "Alunos",
  modules: "Módulos",
  periods: "Períodos",
  enrollments: "Matrículas",
  attendance: "Chamada",
  sheets: "Planilha",
  users: "Usuários",
  medical_certificates: "Atestados",
  medical_certificate_attachments: "Anexos de atestado",
};

const ENTITY_FILTERS: FilterChipOption<string>[] = [
  { value: "__all", label: "Todas as entidades" },
  ...Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label })),
];

const ACTION_LABELS: Record<AuditAction, string> = {
  insert: "Criação",
  update: "Alteração",
  delete: "Exclusão",
};

const ACTION_VARIANT = {
  insert: "success",
  update: "secondary",
  delete: "destructive",
} as const;

const DIFF_CELL = "px-3 py-2 font-mono text-[11.5px] break-all";

function DiffBlock({ entry }: { entry: AuditLogEntry }) {
  const before: Record<string, unknown> = entry.before_data ?? {};
  const after: Record<string, unknown> = entry.after_data ?? {};
  let keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  // Na alteração, só o que mudou; criação e exclusão mostram tudo.
  if (entry.action === "update") {
    keys = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  }

  if (keys.length === 0) {
    return (
      <p className="text-xs italic text-muted-foreground">
        Nenhum campo registrado.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-[10px] border">
      <table className="w-full table-fixed text-left">
        <thead className="border-b bg-muted/40 text-[11px] font-semibold uppercase text-muted-foreground">
          <tr>
            <th className="w-[35%] px-3 py-2 font-semibold sm:w-[150px]">Campo</th>
            <th className="px-3 py-2 font-semibold">Antes</th>
            <th className="px-3 py-2 font-semibold">Depois</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="border-b last:border-0">
              <td className={DIFF_CELL}>{k}</td>
              <td className={cn(DIFF_CELL, "text-destructive")}>{formatValue(before[k])}</td>
              <td className={cn(DIFF_CELL, "text-success")}>{formatValue(after[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function AuditLogPage() {
  const [page, setPage] = useState(0);
  const [entity, setEntity] = useState<string>("__all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const params = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      ...(entity !== "__all" ? { entity } : {}),
    }),
    [page, entity],
  );

  const { data, isLoading, isError, error } = useAuditLog(params);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <PageHeader eyebrow="Administração" title="Registro de auditoria" />

      <div className="flex flex-wrap items-center gap-2">
        <FilterChips
          label="Filtrar por entidade"
          options={ENTITY_FILTERS}
          value={entity}
          onChange={(v) => {
            setEntity(v);
            setPage(0);
          }}
        />
        <p className="ml-auto text-[12.5px] text-muted-foreground">
          {total > 0
            ? `${total.toLocaleString("pt-BR")} registro${total !== 1 ? "s" : ""}`
            : "Sem registros"}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Erro ao carregar histórico"
          description={(error as Error)?.message ?? "Tente novamente em alguns instantes."}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nenhum registro encontrado"
          description="Quando houver alterações em notas, alunos ou módulos, o histórico aparecerá aqui."
        />
      ) : (
        <>
          <section className="overflow-hidden rounded-xl border bg-card">
            <ul>
              {items.map((entry) => {
                const isOpen = expanded.has(entry.id);
                const Chevron = isOpen ? ChevronUp : ChevronDown;
                const when = new Date(entry.created_at);
                return (
                  <li key={entry.id} className="border-b last:border-0">
                    {/* Linhas quebram em telas estreitas em vez de rolar */}
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => toggle(entry.id)}
                      className="flex w-full flex-wrap items-center gap-3 px-[18px] py-[11px] text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <time
                        dateTime={entry.created_at}
                        title={format(when, "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        className="w-[120px] shrink-0 font-mono text-[11.5px] text-muted-foreground"
                      >
                        {format(when, "dd/MM HH:mm", { locale: ptBR })}
                      </time>
                      <span
                        className={cn(
                          badgeVariants({ variant: ACTION_VARIANT[entry.action] }),
                          "shrink-0 text-[11.5px]",
                        )}
                      >
                        {ACTION_LABELS[entry.action]}
                      </span>
                      <span className="w-[90px] shrink-0 text-xs text-muted-foreground">
                        {ENTITY_LABELS[entry.entity] ?? entry.entity}
                      </span>
                      <span className="min-w-[140px] flex-1 text-[13.5px]">{entry.summary}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {entry.actor_name}
                      </span>
                      <Chevron
                        aria-hidden="true"
                        className="h-[15px] w-[15px] shrink-0 text-muted-foreground"
                      />
                    </button>
                    {isOpen && (
                      <div className="px-[18px] pb-3.5">
                        <DiffBlock entry={entry} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
