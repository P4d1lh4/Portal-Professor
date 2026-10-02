import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  Loader2,
  Search,
  Upload,
} from "lucide-react";

import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { GradeBadge } from "@/components/shared/GradeBadge";
import { FilterChips } from "@/components/shared/FilterChips";
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
import { cardTable } from "@/components/ui/card-table";
import { cn, formatGrade } from "@/lib/utils";
import { classifyStatus, type Status } from "@/lib/classification";
import { ModuleTabs, ModuleWorkspace } from "@/features/modules/ModuleWorkspace";
import { moduleEyebrow, usePeriodModules } from "@/features/modules/usePeriodModules";
import { useModuleAttendance } from "@/features/attendance/useAttendance";
import { useDownloadModuleGrades } from "@/features/exports/useExports";
import { useImportGrades, useModuleGrades, useUpdateGrade } from "./useGrades";
import { matchesSituation, SITUATION_OPTIONS, type Situation } from "./situation";
import type { StudentGradeRow } from "./api";

// ─── Grade input cell ─────────────────────────────────────────────────────────

interface GradeCellProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (v: number) => void;
  inputRef?: React.RefCallback<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  disabled?: boolean;
  ariaLabel: string;
}

function GradeCell({
  value,
  min = 0,
  max = 10,
  step = 0.1,
  onCommit,
  inputRef,
  onKeyDown,
  disabled = false,
  ariaLabel,
}: GradeCellProps) {
  const [local, setLocal] = useState(String(value));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  // Faz o parse, limita ao intervalo e avisa se a nota digitada teve de ser
  // ajustada (ex.: "15" vira 10) — antes o ajuste era silencioso.
  const commitValue = useCallback(
    (raw: string) => {
      const parsed = parseFloat(raw);
      if (isNaN(parsed)) return;
      const clamped = Math.min(max, Math.max(min, parsed));
      if (clamped !== parsed) {
        toast.warning(`Nota ajustada para o intervalo permitido (${min}–${max}).`);
        setLocal(String(clamped));
      }
      onCommit(clamped);
    },
    [onCommit, min, max]
  );

  const schedule = useCallback(
    (raw: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        commitValue(raw);
        timerRef.current = null; // marca que o debounce já comitou
      }, 300);
    },
    [commitValue]
  );

  return (
    <Input
      ref={inputRef}
      type="number"
      min={min}
      max={max}
      step={step}
      value={local}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => {
        setLocal(e.target.value);
        schedule(e.target.value);
      }}
      onBlur={() => {
        // Só comita se o debounce ainda não disparou — senão o blur após o
        // debounce disparava um segundo PUT idêntico (double-commit).
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
          commitValue(local);
        }
      }}
      onKeyDown={onKeyDown}
      className="h-10 w-full rounded-[10px] bg-card px-1 text-center font-mono text-[15px] tabular-nums hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-60 md:w-[74px]"
    />
  );
}

// ─── Save status indicator ────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved";

function SaveIndicator({ status }: { status: SaveStatus }) {
  // Região aria-live estável: leitores de tela anunciam "salvando…"/"salvo"
  // quando o conteúdo muda (antes era só visual).
  return (
    <span
      role="status"
      aria-live="polite"
      className="flex min-w-16 items-center gap-1 text-xs whitespace-nowrap"
    >
      {status === "saving" && (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          salvando…
        </span>
      )}
      {status === "saved" && (
        <span className="flex items-center gap-1 text-success">
          <CheckCircle2 className="h-3 w-3" />
          salvo
        </span>
      )}
    </span>
  );
}

// ─── Row-level save hook ──────────────────────────────────────────────────────

function useRowStatuses(moduleId: string) {
  const [statuses, setStatuses] = useState<Record<string, SaveStatus>>({});
  const update = useUpdateGrade(moduleId);

  const save = useCallback(
    async (
      enrollmentId: string,
      body: Parameters<typeof update.mutateAsync>[0]["body"]
    ) => {
      setStatuses((prev) => ({ ...prev, [enrollmentId]: "saving" }));
      try {
        await update.mutateAsync({ enrollmentId, body });
        setStatuses((prev) => ({ ...prev, [enrollmentId]: "saved" }));
        setTimeout(
          () =>
            setStatuses((prev) => ({ ...prev, [enrollmentId]: "idle" })),
          2000
        );
      } catch {
        setStatuses((prev) => ({ ...prev, [enrollmentId]: "idle" }));
        toast.error("Erro ao salvar nota. Verifique a conexão e tente novamente.");
      }
    },
    [update]
  );

  return { statuses, save };
}

// ─── Tons ─────────────────────────────────────────────────────────────────────

const STATUS_TEXT: Record<Status, string> = {
  aprovado: "text-success",
  recuperacao: "text-warning",
  rep_faltas: "text-destructive",
  reprovado: "text-destructive",
};

// Faltas sobre o máximo: ≥80% crítico, ≥50% atenção.
const absenceTone = (absences: number, max: number) => {
  const p = absences / Math.max(max, 1);
  return p >= 0.8
    ? { bar: "bg-destructive", text: "text-destructive" }
    : p >= 0.5
      ? { bar: "bg-warning", text: "text-warning" }
      : { bar: "bg-success", text: "text-success" };
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GradesPage() {
  const [, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [situation, setSituation] = useState<Situation>("");

  const {
    modules,
    activeModule,
    isLoading: modulesLoading,
    isError: modulesError,
    error: modulesErrorObj,
  } = usePeriodModules();

  const activeModuleId = activeModule?.id;
  const maxAbsences = activeModule?.max_absences ?? 0;

  const { data: rows = [], isLoading: gradesLoading } =
    useModuleGrades(activeModuleId);
  const { statuses, save } = useRowStatuses(activeModuleId ?? "");
  const exportGrades = useDownloadModuleGrades();
  const importGrades = useImportGrades(activeModuleId ?? "");
  const importInput = useRef<HTMLInputElement>(null);
  const { confirm, confirmDialog } = useConfirm();

  // P-N9: o CSV do export de notas volta pela mesma tela.
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // deixa escolher o mesmo arquivo de novo
    if (!file || !activeModule) return;
    const ok = await confirm({
      title: `Importar notas em ${activeModule.code}?`,
      description:
        "As notas e faltas preenchidas no arquivo substituem as atuais deste módulo. Célula vazia mantém o valor.",
      confirmLabel: "Importar",
    });
    if (ok) importGrades.mutate(file);
  };

  // P-N4: frequência real = faltas sobre as chamadas já registradas no módulo
  // (a mesma lista que a Chamada usa no histórico, com cache compartilhado).
  const { data: attendanceHistory = [] } = useModuleAttendance(activeModuleId);
  const recordedClasses = attendanceHistory.length;

  // O input atualiza `search` na hora (digitação responsiva), mas o filtro
  // usa o valor debounced — evita recomputar/re-renderizar a tabela a cada
  // tecla quando há muitos alunos.
  const debouncedSearch = useDebouncedValue(search, 300);
  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return rows.filter(
      (r) =>
        (r.full_name.toLowerCase().includes(term) ||
          r.student_number.includes(debouncedSearch)) &&
        matchesSituation(r, maxAbsences, situation)
    );
  }, [rows, debouncedSearch, maxAbsences, situation]);
  const isFiltering = !!search || !!situation;

  const situationChips = useMemo(
    () =>
      SITUATION_OPTIONS.map((o) => ({
        ...o,
        count: rows.filter((r) => matchesSituation(r, maxAbsences, o.value)).length,
      })),
    [rows, maxAbsences]
  );

  const handleModuleChange = (id: string) => {
    setSearchParams({ module: id });
  };

  // Arrow-key + Enter navigation across cells [row][col]
  const cellRefs = useRef<(HTMLInputElement | null)[][]>([]);

  const makeRef =
    (rowIdx: number, colIdx: number): React.RefCallback<HTMLInputElement> =>
    (el) => {
      if (!cellRefs.current[rowIdx]) cellRefs.current[rowIdx] = [];
      cellRefs.current[rowIdx][colIdx] = el;
    };

  const handleKeyNav =
    (rowIdx: number, colIdx: number): React.KeyboardEventHandler<HTMLInputElement> =>
    (e) => {
      if (e.key === "Tab") return;
      if (e.key === "Enter" || e.key === "ArrowDown") {
        e.preventDefault();
        cellRefs.current[rowIdx + 1]?.[colIdx]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        cellRefs.current[rowIdx - 1]?.[colIdx]?.focus();
      } else if (e.key === "ArrowRight") {
        const next = cellRefs.current[rowIdx]?.[colIdx + 1];
        if (next) { e.preventDefault(); next.focus(); }
      } else if (e.key === "ArrowLeft") {
        const prev = cellRefs.current[rowIdx]?.[colIdx - 1];
        if (prev) { e.preventDefault(); prev.focus(); }
      }
    };

  const periodClosed =
    activeModule?.academic_period?.is_active === false;

  const header = (
    <PageHeader
      eyebrow={activeModule ? moduleEyebrow(activeModule) : undefined}
      title={activeModule?.name ?? "Notas e faltas"}
      actions={
        activeModule ? (
          <Button
            variant="outline"
            onClick={() =>
              exportGrades.mutate({
                moduleId: activeModule.id,
                moduleCode: activeModule.code,
              })
            }
            disabled={exportGrades.isPending}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar CSV
          </Button>
        ) : undefined
      }
      tabs={activeModule ? <ModuleTabs moduleId={activeModule.id} /> : undefined}
    />
  );

  const headCls = "h-[42px] px-3 text-[11px] font-semibold uppercase text-muted-foreground";
  const cellCls = `${cardTable.cell} md:px-3 md:py-2.5`;

  return (
    <ModuleWorkspace
      modules={modules}
      activeId={activeModuleId}
      onSelect={handleModuleChange}
      header={header}
    >
      {modulesLoading || gradesLoading ? (
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
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <FilterChips
              label="Filtrar por situação"
              options={situationChips}
              value={situation}
              onChange={setSituation}
            />
            <div className="relative w-full sm:w-52">
              <Search className="absolute left-[11px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar aluno…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-[34px] rounded-[10px] bg-card pl-[34px]"
                aria-label="Buscar aluno"
              />
            </div>
            <p className="text-[12.5px] text-muted-foreground sm:ml-auto">
              Máx. {maxAbsences} falta{maxAbsences !== 1 ? "s" : ""}
              {recordedClasses > 0 && (
                <>
                  {" · "}
                  {recordedClasses} chamada{recordedClasses !== 1 ? "s" : ""} registrada
                  {recordedClasses !== 1 ? "s" : ""}
                </>
              )}
            </p>
          </div>

          {periodClosed && (
            <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-warning/30 bg-warning/10 px-4 py-3 text-[13px] text-warning">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                Este período acadêmico está encerrado. As notas e faltas estão
                em modo somente leitura.
              </span>
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={isFiltering ? "Nenhum aluno encontrado" : "Nenhum aluno matriculado"}
              description={
                isFiltering
                  ? "Tente outro nome, matrícula ou situação."
                  : "Este módulo não possui alunos matriculados."
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table className={`${cardTable.table} md:min-w-[820px]`}>
                <TableHeader className={cardTable.header}>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={cn(headCls, "pl-[18px]")}>Aluno</TableHead>
                    <TableHead className={cn(headCls, "w-[98px] text-center")}>Tutoria</TableHead>
                    <TableHead className={cn(headCls, "w-[98px] text-center")}>Prova</TableHead>
                    <TableHead className={cn(headCls, "w-[98px] text-center")}>Recup.</TableHead>
                    <TableHead className={cn(headCls, "w-[170px]")}>Faltas</TableHead>
                    <TableHead className={cn(headCls, "w-[230px] pr-[18px] text-right")}>Final</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={cardTable.body}>
                  {filtered.map((row: StudentGradeRow, rowIdx) => {
                    const status = statuses[row.enrollment_id] ?? "idle";
                    const situationNow = classifyStatus(row.final_grade, row.absences, maxAbsences);
                    const abs = absenceTone(row.absences, maxAbsences);

                    return (
                      // Card no celular (F-08): aluno; os quatro campos
                      // rotulados; situação, final e "salvo".
                      <TableRow
                        key={row.enrollment_id}
                        className="grid grid-cols-4 items-start gap-x-2 gap-y-2.5 px-4 py-3 md:table-row md:p-0"
                      >
                        <TableCell className={`${cellCls} col-span-4 md:pl-[18px]`}>
                          <div className="flex min-w-0 items-center gap-[11px]">
                            <InitialsAvatar name={row.full_name} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{row.full_name}</p>
                              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                                {row.student_number}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        {/* Tutoria */}
                        <TableCell
                          data-label="Tutoria"
                          className={`${cellCls} ${cardTable.label} text-center`}
                        >
                          <GradeCell
                            value={row.tutor_grade}
                            ariaLabel={`Tutoria de ${row.full_name}`}
                            disabled={periodClosed}
                            inputRef={makeRef(rowIdx, 0)}
                            onKeyDown={handleKeyNav(rowIdx, 0)}
                            onCommit={(v) =>
                              save(row.enrollment_id, { tutor_grade: v })
                            }
                          />
                        </TableCell>

                        {/* Prova regular */}
                        <TableCell
                          data-label="Prova"
                          className={`${cellCls} ${cardTable.label} text-center`}
                        >
                          <GradeCell
                            value={row.regular_exam_grade}
                            ariaLabel={`Prova regular de ${row.full_name}`}
                            disabled={periodClosed}
                            inputRef={makeRef(rowIdx, 1)}
                            onKeyDown={handleKeyNav(rowIdx, 1)}
                            onCommit={(v) =>
                              save(row.enrollment_id, { regular_exam_grade: v })
                            }
                          />
                        </TableCell>

                        {/* Recuperação */}
                        <TableCell
                          data-label="Recup."
                          className={`${cellCls} ${cardTable.label} text-center`}
                        >
                          <GradeCell
                            value={row.makeup_exam_grade}
                            ariaLabel={`Recuperação de ${row.full_name}`}
                            disabled={periodClosed}
                            inputRef={makeRef(rowIdx, 2)}
                            onKeyDown={handleKeyNav(rowIdx, 2)}
                            onCommit={(v) =>
                              save(row.enrollment_id, { makeup_exam_grade: v })
                            }
                          />
                        </TableCell>

                        {/* Faltas: campo + barra sobre o máximo do módulo */}
                        <TableCell
                          data-label="Faltas"
                          className={`${cellCls} ${cardTable.label}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-full md:w-16 md:shrink-0">
                              <GradeCell
                                value={row.absences}
                                ariaLabel={`Faltas de ${row.full_name}`}
                                min={0}
                                max={999}
                                step={1}
                                disabled={periodClosed}
                                inputRef={makeRef(rowIdx, 3)}
                                onKeyDown={handleKeyNav(rowIdx, 3)}
                                onCommit={(v) =>
                                  save(row.enrollment_id, { absences: Math.round(v) })
                                }
                              />
                            </div>
                            <div className="hidden min-w-10 flex-1 md:block">
                              <div className="h-[5px] overflow-hidden rounded-[3px] bg-accent" aria-hidden="true">
                                <div
                                  className={cn("h-full rounded-[3px]", abs.bar)}
                                  style={{ width: `${Math.min(100, (row.absences / Math.max(maxAbsences, 1)) * 100)}%` }}
                                />
                              </div>
                              <p className={cn("mt-1 font-mono text-[10.5px] font-semibold tabular-nums", abs.text)}>
                                {row.absences}/{maxAbsences}
                              </p>
                            </div>
                          </div>
                          {recordedClasses > 0 && (
                            <span
                              className="mt-0.5 block text-[10px] text-muted-foreground tabular-nums"
                              title="Faltas sobre as chamadas já registradas no módulo"
                            >
                              {Math.round((row.absences / recordedClasses) * 100)}% das aulas
                            </span>
                          )}
                        </TableCell>

                        {/* Situação, final (calculada no servidor) e "salvo" */}
                        <TableCell className={`${cellCls} col-span-4 md:pr-[18px]`}>
                          <div className="flex items-center justify-between gap-2.5 md:justify-end">
                            <SaveIndicator status={status} />
                            <GradeBadge
                              finalGrade={row.final_grade}
                              absences={row.absences}
                              maxAbsences={maxAbsences}
                              className="px-2.5 py-1 text-[11.5px]"
                            />
                            <span
                              className={cn(
                                "min-w-[34px] text-right font-mono text-[17px] font-semibold tabular-nums",
                                STATUS_TEXT[situationNow],
                              )}
                            >
                              {formatGrade(row.final_grade)}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Barra fixa no pé: salvamento, contagem e importação */}
          <div className="min-h-4 flex-1" aria-hidden="true" />
          <div className="sticky bottom-0 z-20 -mx-5 -mb-6 flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t bg-card px-5 py-[11px]">
            {periodClosed ? (
              <span className="text-[13px] font-semibold text-muted-foreground">
                Somente leitura
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-success">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success/15">
                  <Check className="h-[13px] w-[13px]" aria-hidden="true" />
                </span>
                Salvo automaticamente
              </span>
            )}
            <span className="text-[12.5px] text-muted-foreground">
              {filtered.length} aluno{filtered.length !== 1 ? "s" : ""}
              {isFiltering ? ` encontrado${filtered.length !== 1 ? "s" : ""}` : " no total"}
            </span>
            <div className="ml-auto">
              <input
                ref={importInput}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                aria-label="Arquivo CSV de notas"
                onChange={handleImportFile}
              />
              <Button
                variant="outline"
                onClick={() => importInput.current?.click()}
                disabled={periodClosed || importGrades.isPending}
              >
                {importGrades.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Importar CSV
              </Button>
            </div>
          </div>
        </>
      )}
      {confirmDialog}
    </ModuleWorkspace>
  );
}
