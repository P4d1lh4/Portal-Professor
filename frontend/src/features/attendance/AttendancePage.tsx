import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  FileSpreadsheet,
  Loader2,
  Save,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useDownloadModuleAttendance } from "@/features/exports/useExports";

import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { InitialsAvatar } from "@/components/shared/InitialsAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ModuleTabs, ModuleWorkspace } from "@/features/modules/ModuleWorkspace";
import { moduleEyebrow, usePeriodModules } from "@/features/modules/usePeriodModules";
import { RiskBadge } from "@/features/grades/RiskBadge";
import { useModuleGrades } from "@/features/grades/useGrades";

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

// Meio-dia local: somar um dia nunca cruza a data por causa do fuso.
function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Botão de status ──────────────────────────────────────────────────────────

const STATUS_STYLE: Record<AttendanceStatus, { letter: string; active: string }> = {
  present: { letter: "P", active: "border-success bg-success text-success-foreground" },
  absent: { letter: "F", active: "border-destructive bg-destructive text-destructive-foreground" },
  justified: { letter: "J", active: "border-warning bg-warning text-warning-foreground" },
};

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
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // 44 px de altura: alvo de toque mínimo (F-08).
        "inline-flex h-11 w-[52px] items-center justify-center rounded-[10px] border text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? STATUS_STYLE[variant].active
          : "bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {STATUS_STYLE[variant].letter}
    </button>
  );
}

// ─── Página ────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlDate = searchParams.get("date") ?? "";

  const [selectedDate, setSelectedDate] = useState(urlDate || todayISO());
  const [search, setSearch] = useState("");

  const {
    modules,
    activeModule,
    isLoading: modulesLoading,
    isError: modulesError,
    error: modulesErrorObj,
  } = usePeriodModules();
  const activeModuleId = activeModule?.id;

  const { data: day, isLoading: dayLoading } = useAttendanceDay(
    activeModuleId,
    selectedDate,
  );
  const { data: history = [] } = useModuleAttendance(activeModuleId);
  // Faltas acumuladas por aluno: a mesma query da tela de Notas (e do RiskBadge).
  const { data: gradeRows } = useModuleGrades(activeModuleId);
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

  const absencesByEnrollment = useMemo(
    () => new Map(gradeRows?.map((r) => [r.enrollment_id, r.absences])),
    [gradeRows],
  );

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

  const { confirm, confirmDialog } = useConfirm();

  // Trocar módulo/data recarrega o rascunho do servidor: sem esta pergunta, a
  // chamada marcada e não salva era descartada em silêncio.
  const confirmDiscard = async () =>
    !isDirty ||
    (await confirm({
      title: "Descartar a chamada não salva?",
      description: "As marcações feitas nesta data serão perdidas.",
      confirmLabel: "Descartar",
      destructive: true,
    }));

  const handleModuleChange = async (id: string) => {
    if (!(await confirmDiscard())) return;
    updateUrl(id, selectedDate);
  };

  const handleDateChange = async (d: string) => {
    if (!d || !(await confirmDiscard())) return;
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

  const handleDelete = async () => {
    if (!day?.record_id || !activeModuleId) return;
    const ok = await confirm({
      title: `Excluir a chamada de ${formatDateBR(selectedDate)}?`,
      description: "Essa ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    deleteMut.mutate(selectedDate);
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  const periodClosed = activeModule?.academic_period?.is_active === false;
  const exportAttendance = useDownloadModuleAttendance();
  const maxAbsences = activeModule?.max_absences ?? 0;

  const header = (
    <PageHeader
      eyebrow={activeModule ? moduleEyebrow(activeModule) : undefined}
      title={activeModule?.name ?? "Chamada"}
      actions={
        activeModule ? (
          <Button
            variant="outline"
            onClick={() =>
              exportAttendance.mutate({
                moduleId: activeModule.id,
                moduleCode: activeModule.code,
              })
            }
            disabled={exportAttendance.isPending}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar CSV
          </Button>
        ) : undefined
      }
      tabs={activeModule ? <ModuleTabs moduleId={activeModule.id} /> : undefined}
    />
  );

  return (
    <ModuleWorkspace
      modules={modules}
      activeId={activeModuleId}
      onSelect={handleModuleChange}
      header={header}
    >
      {modulesLoading ? (
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
      ) : !activeModule ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhum módulo disponível"
          description="Não há módulos neste período para você."
        />
      ) : (
        <>
          {/* Data, ações em massa e contagem do dia */}
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <div className="flex h-10 items-center overflow-hidden rounded-[10px] border bg-card">
              <button
                type="button"
                aria-label="Dia anterior"
                onClick={() => handleDateChange(shiftDate(selectedDate, -1))}
                className="flex h-full w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                aria-label="Data da chamada"
                className="h-full border-x bg-transparent px-3 font-mono text-[13.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:[color-scheme:dark]"
              />
              <button
                type="button"
                aria-label="Dia seguinte"
                onClick={() => handleDateChange(shiftDate(selectedDate, 1))}
                className="flex h-full w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-[10px]"
              onClick={() => markAll("present")}
              disabled={periodClosed || !day?.entries.length}
            >
              <Check className="h-4 w-4" />
              Todos presentes
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-[10px]"
              onClick={() => markAll("absent")}
              disabled={periodClosed || !day?.entries.length}
            >
              <X className="h-4 w-4" />
              Todos faltas
            </Button>

            {isDirty ? (
              <span className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-warning/30 bg-warning/10 px-[13px] text-[12.5px] font-semibold text-warning">
                <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                Rascunho não salvo
              </span>
            ) : (
              day?.record_id && (
                <span className="text-[12.5px] text-muted-foreground">Chamada registrada</span>
              )
            )}

            {day && day.entries.length > 0 && (
              <div className="flex flex-wrap gap-2 lg:ml-auto">
                <span className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-success/15 px-[13px] text-[12.5px] font-semibold text-success">
                  <span className="font-mono text-base">{counts.present}</span>
                  presente{counts.present !== 1 ? "s" : ""}
                </span>
                <span className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-destructive/15 px-[13px] text-[12.5px] font-semibold text-destructive">
                  <span className="font-mono text-base">{counts.absent}</span>
                  falta{counts.absent !== 1 ? "s" : ""}
                </span>
                <span className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-warning/15 px-[13px] text-[12.5px] font-semibold text-warning">
                  <span className="font-mono text-base">{counts.justified}</span>
                  justificada{counts.justified !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>

          {periodClosed && (
            <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-warning/30 bg-warning/10 px-4 py-3 text-[13px] text-warning">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                Este período acadêmico está encerrado. A chamada está em modo
                somente leitura.
              </span>
            </div>
          )}

          {dayLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : day?.entries.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum aluno matriculado"
              description="Este módulo ainda não possui alunos matriculados."
            />
          ) : (
            <>
              <div className="relative mb-3 w-full sm:w-64">
                <Search className="absolute left-[11px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar aluno…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-[34px] rounded-[10px] bg-card pl-[34px]"
                  aria-label="Buscar aluno"
                />
              </div>

              <div className="overflow-hidden rounded-xl border bg-card">
                <Table>
                  <TableHeader className="sr-only">
                    <TableRow>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Frequência</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((row) => {
                      const status = draft[row.enrollment_id] ?? "present";
                      const absences = absencesByEnrollment.get(row.enrollment_id);
                      return (
                        <TableRow key={row.enrollment_id}>
                          <TableCell className="py-[11px] pl-4 pr-2 sm:pl-[18px]">
                            <div className="flex min-w-0 items-center gap-3.5">
                              <InitialsAvatar name={row.full_name} className="hidden h-9 w-9 sm:flex" />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold">
                                  {row.full_name}
                                  <RiskBadge moduleId={activeModuleId} enrollmentId={row.enrollment_id} />
                                </p>
                                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                                  {row.student_number}
                                  {absences != null && ` · ${absences}/${maxAbsences} faltas`}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="w-px py-[11px] pl-2 pr-4 sm:pr-[18px]">
                            <div className="flex gap-1.5">
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
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {filteredEntries.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nenhum aluno encontrado para "{search}".
                  </p>
                )}
              </div>
            </>
          )}

          {/* Histórico recente */}
          {history.length > 0 && (
            <section className="mt-3 rounded-xl border bg-card px-[18px] py-3.5">
              <h2 className="mb-2.5 text-[13.5px]">Últimas chamadas</h2>
              <div className="flex flex-wrap gap-2">
                {history.slice(0, 10).map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    aria-current={h.attendance_date === selectedDate ? "date" : undefined}
                    aria-label={`Chamada de ${formatDateBR(h.attendance_date)}, ${h.total_absent} falta${h.total_absent !== 1 ? "s" : ""}`}
                    onClick={() => handleDateChange(h.attendance_date)}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-[10px] border px-3 font-mono text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      h.attendance_date === selectedDate
                        ? "border-primary bg-accent"
                        : "bg-card hover:border-foreground/30",
                    )}
                  >
                    {h.attendance_date.slice(8, 10)}/{h.attendance_date.slice(5, 7)}
                    <span className={h.total_absent === 0 ? "text-success" : "text-destructive"}>
                      {h.total_absent}F
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Barra fixa no pé: observações, contagem e salvar */}
          <div className="min-h-4 flex-1" aria-hidden="true" />
          <div className="sticky bottom-0 z-20 -mx-5 -mb-6 flex flex-wrap items-center gap-3 border-t bg-card px-5 py-[11px]">
            <label htmlFor="att-notes" className="sr-only">
              Observações do dia (opcional)
            </label>
            <Input
              id="att-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Conteúdo da aula (opcional)"
              disabled={periodClosed || !day}
              className="h-10 min-w-[180px] flex-1 rounded-[10px] bg-card sm:max-w-[400px]"
            />
            <div className="ml-auto flex items-center gap-3">
              {day && day.entries.length > 0 && (
                <span className="hidden text-[12.5px] text-muted-foreground sm:inline">
                  {Object.keys(draft).length} de {day.entries.length} marcados
                </span>
              )}
              {day?.record_id && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-[10px]"
                  onClick={handleDelete}
                  disabled={deleteMut.isPending || periodClosed}
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir
                </Button>
              )}
              <Button
                type="button"
                className="h-11 rounded-[10px] px-[18px]"
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
        </>
      )}

      {confirmDialog}
    </ModuleWorkspace>
  );
}
