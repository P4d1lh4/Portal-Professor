import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Mail, Hash, Calendar, Award, FileText, Pencil, UserX } from "lucide-react";

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
import { useStudentDetail } from "./useStudents";
import type { StudentItem } from "./api";

function GradeStatusBadge({ grade, maxAbsences, absences }: {
  grade: number;
  maxAbsences: number;
  absences: number;
}) {
  if (absences > maxAbsences)
    return <Badge variant="destructive">Reprovado — Faltas</Badge>;
  if (grade >= 7)
    return <Badge variant="success">Aprovado</Badge>;
  if (grade >= 5)
    return <Badge variant="warning">Recuperação</Badge>;
  return <Badge variant="destructive">Reprovado — Nota</Badge>;
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
                Certificados médicos: {student.medical_certificates}
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
                        {student.avg_final_grade
                          .toFixed(1)
                          .replace(".", ",")}
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
                        <GradeStatusBadge
                          grade={mod.final_grade}
                          maxAbsences={mod.max_absences}
                          absences={mod.absences}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <span>
                          Nota:{" "}
                          <span className="font-mono font-semibold text-foreground">
                            {mod.final_grade.toFixed(1).replace(".", ",")}
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

            {/* Ações */}
            {canEdit && student.is_active && (
              <>
                <Separator className="my-4" />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => onEdit(student)}
                  >
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
                </div>
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
