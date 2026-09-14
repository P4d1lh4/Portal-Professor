import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Award,
  Calendar,
  Download,
  FileText,
  Hash,
  Loader2,
  Mail,
  Pencil,
  Plus,
  UserX,
  X,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { useAuth } from "@/hooks/useAuth";
import { formatGrade } from "@/lib/utils";
import { MedicalCertificatesSheet } from "@/features/medical-certificates/MedicalCertificatesSheet";
import { useModules } from "@/features/modules/useModules";
import { useDownloadStudentReport } from "@/features/reports/useReports";
import { useEnrollStudent, useStudentDetail, useUnenrollStudent } from "./useStudents";
import type { ModuleGradeSummary, StudentItem } from "./api";
import { classifyStatus, type Status } from "@/lib/classification";

// Rótulos da ficha, mais explícitos que os da tabela; a regra de situação é a
// de lib/classification (P-06: antes era uma cópia manual dos limiares).
const STATUS_BADGE: Record<
  Status,
  { variant: "success" | "warning" | "destructive"; label: string }
> = {
  aprovado: { variant: "success", label: "Aprovado" },
  recuperacao: { variant: "warning", label: "Recuperação" },
  rep_faltas: { variant: "destructive", label: "Reprovado — Faltas" },
  reprovado: { variant: "destructive", label: "Reprovado — Nota" },
};

function GradeStatusBadge({ grade, maxAbsences, absences }: {
  grade: number;
  maxAbsences: number;
  absences: number;
}) {
  const { variant, label } = STATUS_BADGE[classifyStatus(grade, absences, maxAbsences)];
  return <Badge variant={variant}>{label}</Badge>;
}

function AbsenceBar({ absences, max }: { absences: number; max: number }) {
  const pct = Math.min((absences / Math.max(max, 1)) * 100, 100);
  const color =
    pct >= 80 ? "bg-destructive" : pct >= 50 ? "bg-warning" : "bg-success";
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
        {absences}/{max}
      </span>
    </div>
  );
}

// Matricula o aluno num módulo ativo do período dele que ainda não cursa.
// Montado só para quem pode matricular, então a lista de módulos não é
// buscada à toa para o professor.
// ponytail: <select> nativo; o Radix Select dos dialogs não traz ganho aqui.
function EnrollmentPicker({ student }: { student: StudentItem }) {
  const { data: modules = [] } = useModules(student.academic_period_id);
  const enroll = useEnrollStudent();
  const [moduleId, setModuleId] = useState("");

  const enrolled = new Set(student.enrolled_modules?.map((m) => m.module_id));
  const available = modules.filter(
    (m) =>
      m.is_active &&
      m.academic_period?.is_active !== false &&
      !enrolled.has(m.id),
  );
  if (available.length === 0) return null;

  return (
    <div className="mt-4 flex gap-2">
      <select
        aria-label="Matricular em módulo"
        value={moduleId}
        onChange={(e) => setModuleId(e.target.value)}
        className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Matricular em módulo…</option>
        {available.map((m) => (
          <option key={m.id} value={m.id}>
            {m.code} — {m.name}
          </option>
        ))}
      </select>
      <Button
        variant="outline"
        disabled={!moduleId || enroll.isPending}
        onClick={() =>
          enroll.mutate(
            { moduleId, studentId: student.id },
            { onSuccess: () => setModuleId("") },
          )
        }
      >
        {enroll.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        Matricular
      </Button>
    </div>
  );
}

interface StudentDetailSheetProps {
  studentId: string | null;
  onClose: () => void;
  onEdit: (student: StudentItem) => void;
  onDeactivate: (student: StudentItem) => void;
  canEdit?: boolean;
}

export function StudentDetailSheet({
  studentId,
  onClose,
  onEdit,
  onDeactivate,
  canEdit = true,
}: StudentDetailSheetProps) {
  const { data: student, isLoading } = useStudentDetail(
    studentId ?? undefined
  );
  const { profile } = useAuth();
  const { confirm, confirmDialog } = useConfirm();
  const unenroll = useUnenrollStudent();

  const [certificatesOpen, setCertificatesOpen] = useState(false);
  const downloadReport = useDownloadStudentReport();

  // Matrícula é do coordenador/admin (o backend recusa o professor).
  const canManageEnrollments =
    canEdit &&
    !!student?.is_active &&
    (profile?.role === "admin" || profile?.role === "coordinator");

  const handleUnenroll = async (mod: ModuleGradeSummary) => {
    const ok = await confirm({
      title: `Desmatricular de ${mod.module_name}?`,
      description:
        "As notas e a frequência do aluno neste módulo serão apagadas. A nota fica registrada na auditoria.",
      confirmLabel: "Desmatricular",
      destructive: true,
    });
    if (ok) unenroll.mutate({ enrollmentId: mod.enrollment_id, moduleId: mod.module_id });
  };

  return (
    <Sheet open={!!studentId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        {isLoading || !student ? (
          <div className="space-y-3 pt-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <SheetTitle className="text-lg">{student.full_name}</SheetTitle>
                  <p className="mt-0.5 font-mono text-sm text-muted-foreground">
                    {student.student_number}
                  </p>
                </div>
                <Badge variant={student.is_active ? "success" : "secondary"}>
                  {student.is_active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
            </SheetHeader>

            {/* Info básica */}
            <div className="space-y-2 text-sm">
              {student.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {student.email}
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                Matrícula:{" "}
                {format(
                  new Date(student.enrollment_date + "T12:00:00"),
                  "dd/MM/yyyy",
                  { locale: ptBR }
                )}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Hash className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">
                  Atestados médicos: {student.medical_certificates}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-mr-2 h-7 gap-1 px-2 text-xs"
                  onClick={() => setCertificatesOpen(true)}
                  aria-label="Gerenciar atestados médicos"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Gerenciar
                </Button>
              </div>
              {student.referral_info && (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{student.referral_info}</span>
                </div>
              )}
              {student.observations && (
                <p className="rounded-lg bg-muted px-3 py-2 text-xs">
                  {student.observations}
                </p>
              )}
            </div>

            {/* Resumo de desempenho */}
            {student.enrolled_modules && student.enrolled_modules.length > 0 && (
              <>
                <Separator className="my-4" />
                <div className="flex items-center gap-2 mb-3">
                  <Award className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Desempenho</span>
                  {student.avg_final_grade !== null &&
                    student.avg_final_grade !== undefined && (
                      <span className="ml-auto font-mono text-sm font-semibold">
                        Média:{" "}
                        {formatGrade(student.avg_final_grade)}
                      </span>
                    )}
                </div>

                <div className="space-y-3">
                  {student.enrolled_modules.map((mod) => (
                    <div
                      key={mod.enrollment_id}
                      className="rounded-lg border p-3 space-y-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium leading-tight">
                            {mod.module_name}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {mod.module_code}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <GradeStatusBadge
                            grade={mod.final_grade}
                            maxAbsences={mod.max_absences}
                            absences={mod.absences}
                          />
                          {canManageEnrollments && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              aria-label={`Desmatricular de ${mod.module_name}`}
                              disabled={unenroll.isPending}
                              onClick={() => handleUnenroll(mod)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <span>
                          Nota:{" "}
                          <span className="font-mono font-semibold text-foreground">
                            {formatGrade(mod.final_grade)}
                          </span>
                        </span>
                      </div>

                      <AbsenceBar
                        absences={mod.absences}
                        max={mod.max_absences}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {canManageEnrollments && <EnrollmentPicker student={student} />}

            {/* Ações */}
            <Separator className="my-4" />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="flex-1 min-w-[10rem]"
                onClick={() =>
                  downloadReport.mutate({
                    studentId: student.id,
                    studentName: student.full_name,
                  })
                }
                disabled={downloadReport.isPending}
              >
                {downloadReport.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Baixar boletim
              </Button>
              {canEdit && student.is_active && (
                <>
                  <Button variant="outline" onClick={() => onEdit(student)}>
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDeactivate(student)}
                  >
                    <UserX className="h-4 w-4" />
                    Desativar
                  </Button>
                </>
              )}
            </div>
          </>
        )}
        {confirmDialog}
      </SheetContent>

      <MedicalCertificatesSheet
        studentId={certificatesOpen && student ? student.id : null}
        studentName={student?.full_name}
        onClose={() => setCertificatesOpen(false)}
      />
    </Sheet>
  );
}
