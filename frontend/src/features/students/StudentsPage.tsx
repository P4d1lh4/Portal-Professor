import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  FileSpreadsheet,
  GraduationCap,
  Plus,
  Search,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { FilterChips } from "@/components/shared/FilterChips";
import { InitialsAvatar } from "@/components/shared/InitialsAvatar";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/Pagination";
import { Input } from "@/components/ui/input";
import { badgeVariants } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useSelectedPeriod } from "@/features/periods/useSelectedPeriod";
import {
  useStudentsByPeriod,
  useProfessorStudents,
  useCreateStudentInPeriod,
  useCreateProfessorStudent,
  useUpdateStudent,
  useDeactivateStudent,
} from "./useStudents";
import { StudentDialog } from "./StudentDialog";
import { StudentDetailSheet } from "./StudentDetailSheet";
import { useDownloadPeriodStudents } from "@/features/exports/useExports";
import type { ListPeriodStudentsParams, StudentItem } from "./api";

const PAGE_SIZE = 25;

// ponytail: a rota de coord/admin só filtra por active_only (sem "só inativos"
// nem "em risco de faltas"); a do professor não filtra, então lá não há chips.
type StatusFilter = "active" | "all";
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Ativos" },
  { value: "all", label: "Todos" },
];

const ABSENCE_TONE = {
  destructive: { bar: "bg-destructive", text: "text-destructive" },
  warning: { bar: "bg-warning", text: "text-warning" },
  success: { bar: "bg-success", text: "text-success" },
};

function AbsenceProgress({ absences, max }: { absences: number; max: number }) {
  const pct = Math.min((absences / Math.max(max, 1)) * 100, 100);
  const tone = ABSENCE_TONE[pct >= 80 ? "destructive" : pct >= 50 ? "warning" : "success"];
  return (
    <span className="flex items-center gap-[9px]">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-accent">
        <span
          className={cn("block h-full rounded-full transition-all", tone.bar)}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className={cn("font-mono text-[11.5px] font-semibold", tone.text)}>
        {absences}/{max}
      </span>
    </span>
  );
}

export default function StudentsPage() {
  const { profile } = useAuth();
  const isProfessor = profile?.role === "professor";
  const isCoordinator = profile?.role === "coordinator";

  // O período vem da barra superior (vale para todas as telas).
  const { period, periodId } = useSelectedPeriod();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [page, setPage] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StudentItem | undefined>();
  const [detailId, setDetailId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  // Reset de página quando filtros ou período mudam
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, periodId, statusFilter]);

  const listParams = useMemo<ListPeriodStudentsParams>(() => {
    const params: ListPeriodStudentsParams = {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    };
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (statusFilter === "all") params.active_only = false;
    return params;
  }, [debouncedSearch, page, statusFilter]);

  // Mesma paginação e busca no servidor para os dois papéis (P-Q8); cada um
  // só dispara a sua query.
  const coordinatorQuery = useStudentsByPeriod(
    isCoordinator || profile?.role === "admin" ? periodId : undefined,
    listParams,
  );
  const professorQuery = useProfessorStudents(listParams, isProfessor);
  const query = isProfessor ? professorQuery : coordinatorQuery;

  const students: StudentItem[] = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  const { isLoading, isError, error, isPlaceholderData } = query;

  const createInPeriod = useCreateStudentInPeriod(periodId ?? "");
  const createProfessor = useCreateProfessorStudent();
  const updateStudent = useUpdateStudent();
  const deactivate = useDeactivateStudent();
  const exportStudents = useDownloadPeriodStudents();

  const openCreate = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  const openEdit = (student: StudentItem) => {
    setEditing(student);
    setDetailId(null);
    setDialogOpen(true);
  };

  const { confirm, confirmDialog } = useConfirm();

  const handleDeactivate = async (student: StudentItem) => {
    const ok = await confirm({
      title: `Desativar o aluno "${student.full_name}"?`,
      description: "O aluno ficará inativo; o histórico é preservado.",
      confirmLabel: "Desativar",
      destructive: true,
    });
    if (!ok) return;
    deactivate.mutate(student.id);
    setDetailId(null);
  };

  const handleSubmit = async (data: {
    student_number: string;
    full_name: string;
    email?: string;
    enrollment_date: string;
    referral_info?: string;
    observations?: string;
  }) => {
    if (editing) {
      await updateStudent.mutateAsync({ id: editing.id, body: data });
    } else if (isProfessor) {
      await createProfessor.mutateAsync(data);
    } else {
      if (!periodId) return;
      await createInPeriod.mutateAsync(data);
    }
  };

  // Só a rota do professor traz módulos e faltas por aluno; a de coord/admin
  // devolve o aluno "cru", então essas colunas ficariam sempre vazias.
  const showModules = isProfessor;

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow={isProfessor ? "Seus módulos" : period?.name}
        title="Alunos"
        actions={
          <>
            {!isProfessor && period && (
              <Button
                variant="outline"
                onClick={() =>
                  exportStudents.mutate({
                    periodId: period.id,
                    periodName: period.name,
                  })
                }
                disabled={exportStudents.isPending}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Exportar CSV
              </Button>
            )}
            <Button onClick={openCreate}>
              <Plus />
              Novo aluno
            </Button>
          </>
        }
      />

      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {!isProfessor && (
          <FilterChips
            label="Filtrar por situação"
            options={STATUS_FILTERS}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        )}
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou matrícula…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Buscar alunos"
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
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Erro ao carregar alunos"
          description={
            (error as Error)?.message ??
            "Verifique sua conexão e tente novamente."
          }
        />
      ) : !periodId && !isProfessor ? (
        <EmptyState
          icon={GraduationCap}
          title="Selecione um período"
          description="Escolha um período acadêmico para ver os alunos."
        />
      ) : students.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={
            search
              ? "Nenhum aluno encontrado para esta busca"
              : "Nenhum aluno cadastrado"
          }
          description={
            search
              ? "Tente um nome ou matrícula diferente."
              : "Adicione o primeiro aluno clicando em Novo aluno."
          }
          actionLabel={!search ? "Novo aluno" : undefined}
          onAction={!search ? openCreate : undefined}
        />
      ) : (
        <section className="overflow-x-auto rounded-xl border bg-card">
          {/* Cabeçalho só visual: cada linha é um botão que já lê o próprio conteúdo */}
          <div
            aria-hidden="true"
            className="hidden items-center gap-3 border-b bg-muted/40 px-[18px] py-[11px] text-[11px] font-semibold uppercase text-muted-foreground md:flex"
          >
            <span className="min-w-[150px] flex-1">Aluno</span>
            {showModules && (
              <>
                <span className="w-[200px] shrink-0">Módulos</span>
                <span className="w-[140px] shrink-0">Faltas</span>
              </>
            )}
            <span className="w-[100px] shrink-0 text-right">Situação</span>
          </div>

          <ul>
            {students.map((student) => {
              const modules = student.enrolled_modules ?? [];
              return (
                <li key={student.id} className="border-b">
                  {/* Abaixo de md a linha quebra (faltas descem) em vez de rolar */}
                  <button
                    type="button"
                    onClick={() => setDetailId(student.id)}
                    className="flex w-full flex-wrap items-center gap-3 px-[18px] py-[11px] text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:flex-nowrap"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-[11px] md:min-w-[150px]">
                      <InitialsAvatar name={student.full_name} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {student.full_name}
                        </span>
                        <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                          {student.student_number}
                        </span>
                      </span>
                    </span>
                    {showModules && (
                      <>
                        <span className="hidden w-[200px] shrink-0 truncate font-mono text-[11.5px] text-muted-foreground md:block">
                          {modules.map((m) => m.module_code).join(" · ") || "—"}
                        </span>
                        <span className="w-full max-md:order-last max-md:pl-[45px] md:w-[140px] md:shrink-0">
                          {modules.length > 0 ? (
                            <AbsenceProgress
                              absences={student.total_absences ?? 0}
                              max={modules.reduce((s, m) => s + m.max_absences, 0)}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </span>
                      </>
                    )}
                    <span className="shrink-0 text-right md:w-[100px]">
                      <span
                        className={cn(
                          badgeVariants({
                            variant: student.is_active ? "success" : "secondary",
                          }),
                          "text-[11.5px]",
                        )}
                      >
                        {student.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2.5 px-[18px] py-3">
            <p className="text-[12.5px] text-muted-foreground">
              {total} aluno{total !== 1 ? "s" : ""}{" "}
              {search ? `encontrado${total !== 1 ? "s" : ""}` : "no total"}
            </p>

            <Pagination
              page={page}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              disabled={isPlaceholderData}
            />
          </div>
        </section>
      )}

      {/* Slide-over de detalhe */}
      <StudentDetailSheet
        studentId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={openEdit}
        onDeactivate={handleDeactivate}
        canEdit
      />

      {/* Modal de criar/editar */}
      <StudentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        student={editing}
        onSubmit={handleSubmit}
      />

      {confirmDialog}
    </div>
  );
}
