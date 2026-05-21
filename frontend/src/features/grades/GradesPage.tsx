import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  Loader2,
  Search,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { GradeBadge } from "@/components/shared/GradeBadge";
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
import { useDownloadModuleGrades } from "@/features/exports/useExports";
import { useModuleGrades, useUpdateGrade } from "./useGrades";
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
}: GradeCellProps) {
  const [local, setLocal] = useState(String(value));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  const schedule = useCallback(
    (raw: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const parsed = parseFloat(raw);
        if (!isNaN(parsed)) onCommit(Math.min(max, Math.max(min, parsed)));
      }, 300);
    },
    [onCommit, min, max]
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
      onChange={(e) => {
        setLocal(e.target.value);
        schedule(e.target.value);
      }}
      onBlur={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        const parsed = parseFloat(local);
        if (!isNaN(parsed)) onCommit(Math.min(max, Math.max(min, parsed)));
      }}
      onKeyDown={onKeyDown}
      className="h-8 w-20 text-center font-mono text-sm tabular-nums px-1 disabled:opacity-60 disabled:cursor-not-allowed"
    />
  );
}

// ─── Save status indicator ────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved";

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "saving")
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
        <Loader2 className="h-3 w-3 animate-spin" />
        salvando…
      </span>
    );
  if (status === "saved")
    return (
      <span className="flex items-center gap-1 text-xs text-success whitespace-nowrap">
        <CheckCircle2 className="h-3 w-3" />
        salvo
      </span>
    );
  return <span className="w-16 inline-block" />;
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GradesPage() {
  const { profile } = useAuth();
  const isProfessor = profile?.role === "professor";

  const [searchParams, setSearchParams] = useSearchParams();
  const urlModuleId = searchParams.get("module") ?? "";
  const [selectedModuleId, setSelectedModuleId] = useState(urlModuleId);
  const [search, setSearch] = useState("");

  const {
    data: modules = [],
    isLoading: modulesLoading,
    isError: modulesError,
    error: modulesErrorObj,
  } = useModules();

  // Once modules load, default to URL param or first module
  useEffect(() => {
    if (modules.length > 0 && !selectedModuleId) {
      setSelectedModuleId(urlModuleId || modules[0].id);
    }
  }, [modules, selectedModuleId, urlModuleId]);

  const activeModuleId = selectedModuleId || modules[0]?.id;
  const activeModule = modules.find((m) => m.id === activeModuleId);

  const { data: rows = [], isLoading: gradesLoading } =
    useModuleGrades(activeModuleId);
  const { statuses, save } = useRowStatuses(activeModuleId ?? "");
  const exportGrades = useDownloadModuleGrades();

  // O input atualiza `search` na hora (digitação responsiva), mas o filtro
  // usa o valor debounced — evita recomputar/re-renderizar a tabela a cada
  // tecla quando há muitos alunos.
  const debouncedSearch = useDebouncedValue(search, 300);
  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return rows.filter(
      (r) =>
        r.full_name.toLowerCase().includes(term) ||
        r.student_number.includes(debouncedSearch)
    );
  }, [rows, debouncedSearch]);

  const handleModuleChange = (id: string) => {
    setSelectedModuleId(id);
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

  const isLoading = modulesLoading || gradesLoading;
  const maxAbsences = activeModule?.max_absences ?? 0;
  const periodClosed =
    activeModule?.academic_period?.is_active === false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notas e Faltas"
        description={
          isProfessor
            ? "Lançamento inline de notas e faltas dos seus módulos."
            : "Visualização e edição de notas por módulo."
        }
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
      />

      {/* Module selector — tabs if ≤4, dropdown if more */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {modules.length > 0 && modules.length <= 4 ? (
          <div className="flex flex-wrap gap-2">
            {modules.map((m) => (
              <button
                key={m.id}
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

      {/* Content */}
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
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={search ? "Nenhum aluno encontrado" : "Nenhum aluno matriculado"}
          description={
            search
              ? "Tente um nome ou matrícula diferente."
              : "Este módulo não possui alunos matriculados."
          }
        />
      ) : (
        <>
          {activeModule && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {activeModule.name}
              </span>
              {" · "}máximo de {maxAbsences} falta
              {maxAbsences !== 1 ? "s" : ""}
            </p>
          )}

          {periodClosed && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
              <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
              <span>
                Este período acadêmico está encerrado. As notas e faltas estão
                em modo somente leitura.
              </span>
            </div>
          )}

          <div className="rounded-xl border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Matrícula</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-24 text-center">Tutoria</TableHead>
                  <TableHead className="w-24 text-center">Prova reg.</TableHead>
                  <TableHead className="w-28 text-center">Recuperação</TableHead>
                  <TableHead className="w-20 text-center">Final</TableHead>
                  <TableHead className="w-20 text-center">Faltas</TableHead>
                  <TableHead className="w-28 text-center">Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row: StudentGradeRow, rowIdx) => {
                  const status = statuses[row.enrollment_id] ?? "idle";

                  return (
                    <TableRow key={row.enrollment_id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.student_number}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {row.full_name}
                      </TableCell>

                      {/* Tutoria */}
                      <TableCell className="text-center">
                        <GradeCell
                          value={row.tutor_grade}
                          disabled={periodClosed}
                          inputRef={makeRef(rowIdx, 0)}
                          onKeyDown={handleKeyNav(rowIdx, 0)}
                          onCommit={(v) =>
                            save(row.enrollment_id, { tutor_grade: v })
                          }
                        />
                      </TableCell>

                      {/* Prova regular */}
                      <TableCell className="text-center">
                        <GradeCell
                          value={row.regular_exam_grade}
                          disabled={periodClosed}
                          inputRef={makeRef(rowIdx, 1)}
                          onKeyDown={handleKeyNav(rowIdx, 1)}
                          onCommit={(v) =>
                            save(row.enrollment_id, { regular_exam_grade: v })
                          }
                        />
                      </TableCell>

                      {/* Recuperação */}
                      <TableCell className="text-center">
                        <GradeCell
                          value={row.makeup_exam_grade}
                          disabled={periodClosed}
                          inputRef={makeRef(rowIdx, 2)}
                          onKeyDown={handleKeyNav(rowIdx, 2)}
                          onCommit={(v) =>
                            save(row.enrollment_id, { makeup_exam_grade: v })
                          }
                        />
                      </TableCell>

                      {/* Final — read-only, server-calculated */}
                      <TableCell className="text-center">
                        <span className="font-mono text-sm font-semibold tabular-nums">
                          {row.final_grade.toFixed(1)}
                        </span>
                      </TableCell>

                      {/* Faltas */}
                      <TableCell className="text-center">
                        <GradeCell
                          value={row.absences}
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
                      </TableCell>

                      {/* Status badge */}
                      <TableCell className="text-center">
                        <GradeBadge
                          finalGrade={row.final_grade}
                          absences={row.absences}
                          maxAbsences={maxAbsences}
                        />
                      </TableCell>

                      {/* Save indicator */}
                      <TableCell>
                        <SaveIndicator status={status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            {filtered.length} aluno{filtered.length !== 1 ? "s" : ""}
            {search ? ` encontrado${filtered.length !== 1 ? "s" : ""}` : " no total"}
          </p>
        </>
      )}
    </div>
  );
}
