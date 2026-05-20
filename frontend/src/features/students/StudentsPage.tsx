import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  GraduationCap,
  Plus,
  Search,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { usePeriods } from "@/features/periods/usePeriods";
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

function AbsenceProgress({
  absences,
  max,
}: {
  absences: number;
  max: number;
}) {
  const pct = Math.min((absences / Math.max(max, 1)) * 100, 100);
  const color =
    pct >= 80
      ? "bg-destructive"
      : pct >= 50
        ? "bg-warning"
        : "bg-success";
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-xs text-muted-foreground">
        {absences}/{max}
      </span>
    </div>
  );
}

export default function StudentsPage() {
  const { profile } = useAuth();
  const isProfessor = profile?.role === "professor";
  const isCoordinator = profile?.role === "coordinator";

  // Lista TODOS os períodos que o usuário pode acessar (ativos e inativos),
  // não apenas os ativos — coord/admin frequentemente precisam consultar
  // alunos de períodos passados. O backend já filtra por papel.
  const { data: availablePeriods = [] } = usePeriods();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const periodId = selectedPeriodId || availablePeriods[0]?.id;

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StudentItem | undefined>();
  const [detailId, setDetailId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  // Reset de página quando filtros ou período mudam
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, periodId]);

  const coordParams = useMemo<ListPeriodStudentsParams>(() => {
    const params: ListPeriodStudentsParams = {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    };
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    return params;
  }, [debouncedSearch, page]);

  const coordinatorQuery = useStudentsByPeriod(
    isCoordinator || profile?.role === "admin" ? periodId : undefined,
    coordParams,
  );
  const professorQuery = useProfessorStudents();

  // Professor: lista já vem completa (sem paginação no backend ainda).
  // Filtra/pagina no client.
  const professorAll: StudentItem[] = professorQuery.data ?? [];
  const professorFiltered = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return professorAll;
    return professorAll.filter(
      (s) =>
        s.full_name.toLowerCase().includes(term) ||
        s.student_number.toLowerCase().includes(term),
    );
  }, [professorAll, debouncedSearch]);

  const students: StudentItem[] = isProfessor
    ? professorFiltered
    : (coordinatorQuery.data?.items ?? []);
  const total = isProfessor
    ? professorFiltered.length
    : (coordinatorQuery.data?.total ?? 0);
  const totalPages = isProfessor
    ? 1
    : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPrev = !isProfessor && page > 0;
  const canNext = !isProfessor && page < totalPages - 1;

  const isLoading = isProfessor
    ? professorQuery.isLoading
    : coordinatorQuery.isLoading;
  const isError = isProfessor
    ? professorQuery.isError
    : coordinatorQuery.isError;
  const error = isProfessor ? professorQuery.error : coordinatorQuery.error;
  const isPlaceholderData = !isProfessor && coordinatorQuery.isPlaceholderData;

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

  const handleDeactivate = (student: StudentItem) => {
    if (!confirm(`Desativar o aluno "${student.full_name}"?`)) return;
    deactivate.mutate(student.id);
    setDetailId(null);
  };

  const handleSubmit = async (data: {
    student_number: string;
    full_name: string;
    email?: string;
    enrollment_date: string;
    medical_certificates?: number;
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alunos"
        description={
          isProfessor
            ? "Alunos matriculados nos seus módulos."
            : "Gerencie os alunos do período selecionado."
        }
        actions={
          <>
            {!isProfessor && periodId && (
              <Button
                variant="outline"
                onClick={() => {
                  const period = availablePeriods.find((p) => p.id === periodId);
                  if (!period) return;
                  exportStudents.mutate({
                    periodId: period.id,
                    periodName: period.name,
                  });
                }}
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {(isCoordinator || profile?.role === "admin") && (
          <Select
            value={selectedPeriodId || periodId || ""}
            onValueChange={setSelectedPeriodId}
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Selecione um período" />
            </SelectTrigger>
            <SelectContent>
              {availablePeriods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {!p.is_active && " (inativo)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="relative flex-1">
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
        <>
          {/* Tabela — desktop */}
          <div className="hidden md:block rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Matrícula</TableHead>
                  <TableHead>Nome</TableHead>
                  {isProfessor && (
                    <TableHead className="w-40">Faltas (módulos)</TableHead>
                  )}
                  <TableHead className="w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow
                    key={student.id}
                    className="cursor-pointer"
                    onClick={() => setDetailId(student.id)}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {student.student_number}
                    </TableCell>
                    <TableCell className="font-medium">
                      {student.full_name}
                    </TableCell>
                    {isProfessor && (
                      <TableCell>
                        {student.enrolled_modules &&
                        student.enrolled_modules.length > 0 ? (
                          <AbsenceProgress
                            absences={student.total_absences ?? 0}
                            max={student.enrolled_modules.reduce(
                              (s, m) => s + m.max_absences,
                              0
                            )}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      {student.is_active ? (
                        <Badge variant="success">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Cards — mobile */}
          <div className="grid gap-3 md:hidden">
            {students.map((student) => (
              <button
                key={student.id}
                className="w-full rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setDetailId(student.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{student.full_name}</p>
                    <p className="font-mono text-xs text-muted-foreground mt-0.5">
                      {student.student_number}
                    </p>
                  </div>
                  <Badge
                    variant={student.is_active ? "success" : "secondary"}
                  >
                    {student.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>

                {isProfessor &&
                  student.enrolled_modules &&
                  student.enrolled_modules.length > 0 && (
                    <div className="mt-2">
                      <AbsenceProgress
                        absences={student.total_absences ?? 0}
                        max={student.enrolled_modules.reduce(
                          (s, m) => s + m.max_absences,
                          0
                        )}
                      />
                    </div>
                  )}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {total} aluno{total !== 1 ? "s" : ""}{" "}
              {search ? `encontrado${total !== 1 ? "s" : ""}` : "no total"}
              {totalPages > 1 &&
                ` · página ${page + 1} de ${totalPages}`}
            </p>

            {totalPages > 1 && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canPrev || isPlaceholderData}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canNext || isPlaceholderData}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </>
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
    </div>
  );
}
