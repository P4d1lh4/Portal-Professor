import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ClipboardList,
  Loader2,
  Save,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useModules } from "@/features/modules/useModules";

import {
  useAttendanceDay,
  useDeleteAttendance,
  useModuleAttendance,
  useSaveAttendance,
} from "./useAttendance";
import type { AttendanceStatus } from "./api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Presente",
  absent: "Falta",
  justified: "Justificado",
};

// ─── Botão de status (segmento) ───────────────────────────────────────────────

interface StatusButtonProps {
  active: boolean;
  variant: AttendanceStatus;
  onClick: () => void;
  ariaLabel: string;
  disabled?: boolean;
}

function StatusButton({
  active,
  variant,
  onClick,
  ariaLabel,
  disabled = false,
}: StatusButtonProps) {
  const base =
    "h-8 w-9 inline-flex items-center justify-center text-xs font-semibold transition-colors border";
  const styles: Record<AttendanceStatus, { active: string; inactive: string }> = {
    present: {
      active: "bg-success text-white border-success",
      inactive: "bg-card border-input text-muted-foreground hover:bg-success/10",
    },
    absent: {
      active: "bg-destructive text-white border-destructive",
      inactive:
        "bg-card border-input text-muted-foreground hover:bg-destructive/10",
    },
    justified: {
      active: "bg-warning text-white border-warning",
      inactive:
        "bg-card border-input text-muted-foreground hover:bg-warning/10",
    },
  };
  const rounded =
    variant === "present"
      ? "rounded-l-md"
      : variant === "justified"
        ? "rounded-r-md -ml-px"
        : "-ml-px";
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${rounded} ${active ? styles[variant].active : styles[variant].inactive} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {variant === "present" ? "P" : variant === "absent" ? "F" : "J"}
    </button>
  );
}

// ─── Página ────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { profile } = useAuth();
  const isProfessor = profile?.role === "professor";

  const [searchParams, setSearchParams] = useSearchParams();
  const urlModule = searchParams.get("module") ?? "";
  const urlDate = searchParams.get("date") ?? "";

  const [selectedModuleId, setSelectedModuleId] = useState(urlModule);
  const [selectedDate, setSelectedDate] = useState(urlDate || todayISO());
  const [search, setSearch] = useState("");

  const {
    data: modules = [],
    isLoading: modulesLoading,
    isError: modulesError,
    error: modulesErrorObj,
  } = useModules();

  useEffect(() => {
    if (modules.length > 0 && !selectedModuleId) {
      setSelectedModuleId(urlModule || modules[0].id);
    }
  }, [modules, selectedModuleId, urlModule]);

  const activeModuleId = selectedModuleId || modules[0]?.id;
  const activeModule = modules.find((m) => m.id === activeModuleId);

  const { data: day, isLoading: dayLoading } = useAttendanceDay(
    activeModuleId,
    selectedDate,
  );
  const { data: history = [] } = useModuleAttendance(activeModuleId);
  const saveMut = useSaveAttendance(activeModuleId ?? "", selectedDate);
  const deleteMut = useDeleteAttendance(activeModuleId ?? "");

  // Estado local das entries (Map enrollmentId -> status). Reseta quando o
  // backend devolve dados novos (módulo/data muda) ou após salvar.
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [notes, setNotes] = useState("");
  const [serverFingerprint, setServerFingerprint] = useState("");

  useEffect(() => {
    if (!day) return;
    const next: Record<string, AttendanceStatus> = {};
    for (const e of day.entries) next[e.enrollment_id] = e.status;
    setDraft(next);
    setNotes(day.notes ?? "");
    setServerFingerprint(JSON.stringify(next) + "|" + (day.notes ?? ""));
  }, [day]);

  const isDirty = useMemo(() => {
    return JSON.stringify(draft) + "|" + notes !== serverFingerprint;
  }, [draft, notes, serverFingerprint]);

  const filteredEntries = useMemo(() => {
    if (!day) return [];
    const q = search.toLowerCase();
    return day.entries.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        e.student_number.toLowerCase().includes(q),
    );
  }, [day, search]);

  const counts = useMemo(() => {
    let p = 0,
      a = 0,
      j = 0;
    for (const status of Object.values(draft)) {
      if (status === "present") p++;
      else if (status === "absent") a++;
      else j++;
    }
    return { present: p, absent: a, justified: j };
  }, [draft]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const updateUrl = (moduleId: string, date: string) => {
    setSearchParams({ module: moduleId, date });
  };

  const handleModuleChange = (id: string) => {
    setSelectedModuleId(id);
    updateUrl(id, selectedDate);
  };

  const handleDateChange = (d: string) => {
    setSelectedDate(d);
    if (activeModuleId) updateUrl(activeModuleId, d);
  };

  const setStatus = (enrollmentId: string, status: AttendanceStatus) => {
    setDraft((prev) => ({ ...prev, [enrollmentId]: status }));
  };

  const markAll = (status: AttendanceStatus) => {
    if (!day) return;
    const next: Record<string, AttendanceStatus> = {};
    for (const e of day.entries) next[e.enrollment_id] = status;
    setDraft(next);
  };

  const handleSave = () => {
    if (!day || !activeModuleId) return;
    saveMut.mutate({
      notes: notes.trim() || null,
      entries: day.entries.map((e) => ({
        enrollment_id: e.enrollment_id,
        status: draft[e.enrollment_id] ?? "present",
      })),
    });
  };

  const handleDelete = () => {
    if (!day?.record_id || !activeModuleId) return;
    const ok = window.confirm(
      `Excluir a chamada de ${formatDateBR(selectedDate)}? Essa ação não pode ser desfeita.`,
    );
    if (!ok) return;
    deleteMut.mutate(selectedDate);
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  const isLoading = modulesLoading || dayLoading;
  const noEntries = day?.entries.length === 0;
  const periodClosed = activeModule?.academic_period?.is_active === false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chamada"
        description={
          isProfessor
            ? "Registre a frequência dos seus alunos por dia de aula."
            : "Visualize e edite registros de frequência por módulo."
        }
      />

      {/* Controles: módulo + data */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {modules.length > 0 && modules.length <= 4 ? (
          <div className="flex flex-wrap gap-2">
            {modules.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleModuleChange(m.id)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeModuleId === m.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card hover:bg-accent/50"
                }`}
              >
                {m.code}
              </button>
            ))}
          </div>
        ) : (
          <Select
            value={activeModuleId ?? ""}
            onValueChange={handleModuleChange}
          >
            <SelectTrigger className="w-full sm:w-64">
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

        <div className="flex items-center gap-2">
          <CalendarDays
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="w-44"
            aria-label="Data da chamada"
          />
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar aluno…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Buscar aluno"
          />
        </div>
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : modulesError ? (
        <EmptyState
          icon={AlertCircle}
          title="Erro ao carregar módulos"
          description={
            (modulesErrorObj as Error)?.message ??
            "Verifique sua conexão e tente novamente."
          }
        />
      ) : !activeModuleId || modules.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhum módulo disponível"
          description="Não há módulos atribuídos a você no momento."
        />
      ) : noEntries ? (
        <EmptyState
          icon={Users}
          title="Nenhum aluno matriculado"
          description="Este módulo ainda não possui alunos matriculados."
        />
      ) : (
        <>
          {/* Cabeçalho do dia + ações em massa */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {activeModule?.name}
              </span>
              {" · "}
              {formatDateBR(selectedDate)}
              {" · "}
              <span className="text-success font-medium">{counts.present} P</span>
              {" / "}
              <span className="text-destructive font-medium">
                {counts.absent} F
              </span>
              {" / "}
              <span className="text-warning font-medium">
                {counts.justified} J
              </span>
              {day?.record_id ? (
                <span className="ml-2 text-xs">(registrada)</span>
              ) : (
                <span className="ml-2 text-xs italic">(rascunho)</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => markAll("present")}
                disabled={periodClosed}
              >
                <Check className="h-4 w-4" />
                Todos presentes
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => markAll("absent")}
                disabled={periodClosed}
              >
                <X className="h-4 w-4" />
                Todos faltas
              </Button>
            </div>
          </div>

          {periodClosed && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
              <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
              <span>
                Este período acadêmico está encerrado. A chamada está em modo
                somente leitura.
              </span>
            </div>
          )}

          <div className="rounded-xl border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Matrícula</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-44 text-center">Frequência</TableHead>
                  <TableHead className="w-32 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((row) => {
                  const status = draft[row.enrollment_id] ?? "present";
                  return (
                    <TableRow key={row.enrollment_id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.student_number}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {row.full_name}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="inline-flex">
                          <StatusButton
                            variant="present"
                            active={status === "present"}
                            disabled={periodClosed}
                            onClick={() => setStatus(row.enrollment_id, "present")}
                            ariaLabel={`Marcar ${row.full_name} como presente`}
                          />
                          <StatusButton
                            variant="absent"
                            active={status === "absent"}
                            disabled={periodClosed}
                            onClick={() => setStatus(row.enrollment_id, "absent")}
                            ariaLabel={`Marcar ${row.full_name} como falta`}
                          />
                          <StatusButton
                            variant="justified"
                            active={status === "justified"}
                            disabled={periodClosed}
                            onClick={() => setStatus(row.enrollment_id, "justified")}
                            ariaLabel={`Marcar ${row.full_name} como justificado`}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {STATUS_LABEL[status]}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {filteredEntries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center">
              Nenhum aluno encontrado para "{search}".
            </p>
          )}

          {/* Observações + ações */}
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <label
                htmlFor="att-notes"
                className="text-xs font-medium text-muted-foreground"
              >
                Observações do dia (opcional)
              </label>
              <Input
                id="att-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Conteúdo da aula, eventos, etc."
                disabled={periodClosed}
              />
            </div>

            <div className="flex gap-2">
              {day?.record_id && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDelete}
                  disabled={deleteMut.isPending || periodClosed}
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir
                </Button>
              )}
              <Button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || saveMut.isPending || periodClosed}
              >
                {saveMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar chamada
              </Button>
            </div>
          </div>

          {/* Histórico recente */}
          {history.length > 0 && (
            <div className="space-y-2 pt-4">
              <h2 className="text-sm font-medium text-muted-foreground">
                Últimas chamadas
              </h2>
              <div className="flex flex-wrap gap-2">
                {history.slice(0, 10).map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => handleDateChange(h.attendance_date)}
                    className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                      h.attendance_date === selectedDate
                        ? "bg-primary/10 text-primary border-primary"
                        : "bg-card hover:bg-accent/50"
                    }`}
                  >
                    {formatDateBR(h.attendance_date)}
                    <span className="ml-2 text-muted-foreground">
                      {h.total_absent}F
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
