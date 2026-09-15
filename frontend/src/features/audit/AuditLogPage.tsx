import { Fragment, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  History,
} from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/shared/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

const ACTION_LABELS: Record<AuditAction, string> = {
  insert: "Criação",
  update: "Alteração",
  delete: "Exclusão",
};

function ActionBadge({ action }: { action: AuditAction }) {
  if (action === "insert") return <Badge variant="success">{ACTION_LABELS[action]}</Badge>;
  if (action === "delete") return <Badge variant="destructive">{ACTION_LABELS[action]}</Badge>;
  return <Badge variant="secondary">{ACTION_LABELS[action]}</Badge>;
}

function DiffBlock({ entry }: { entry: AuditLogEntry }) {
  const before = entry.before_data ?? {};
  const after = entry.after_data ?? {};
  const keys = Array.from(
    new Set([...Object.keys(before), ...Object.keys(after)]),
  );

  if (keys.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Nenhum campo registrado.
      </p>
    );
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3 text-xs">
      <table className="w-full">
        <thead className="text-muted-foreground">
          <tr>
            <th className="pb-2 text-left font-medium">Campo</th>
            <th className="pb-2 text-left font-medium">Antes</th>
            <th className="pb-2 text-left font-medium">Depois</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="border-t border-border/50">
              <td className="py-1 pr-3 font-mono text-[11px]">{k}</td>
              <td className="py-1 pr-3 font-mono text-[11px] text-destructive">
                {formatValue((before as Record<string, unknown>)[k])}
              </td>
              <td className="py-1 font-mono text-[11px] text-success">
                {formatValue((after as Record<string, unknown>)[k])}
              </td>
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
    <div className="space-y-6">
      <PageHeader
        title="Auditoria"
        description="Histórico de alterações em notas, alunos, módulos e períodos."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          value={entity}
          onValueChange={(v) => {
            setEntity(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Filtrar por entidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas as entidades</SelectItem>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <p className="text-xs text-muted-foreground sm:ml-auto">
          {total > 0 ? `${total} registros` : "Sem registros"}
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
          <div className="rounded-xl border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Data/Hora</TableHead>
                  <TableHead className="w-32">Tipo</TableHead>
                  <TableHead className="w-32">Entidade</TableHead>
                  <TableHead>Resumo</TableHead>
                  <TableHead className="w-44">Autor</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((entry) => {
                  const isOpen = expanded.has(entry.id);
                  return (
                    <Fragment key={entry.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => toggle(entry.id)}
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })}
                        </TableCell>
                        <TableCell>
                          <ActionBadge action={entry.action} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {ENTITY_LABELS[entry.entity] ?? entry.entity}
                        </TableCell>
                        <TableCell className="text-sm">{entry.summary}</TableCell>
                        <TableCell className="text-xs">
                          {entry.actor_name}
                        </TableCell>
                        <TableCell>
                          {isOpen ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/20 p-4">
                            <DiffBlock entry={entry} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
