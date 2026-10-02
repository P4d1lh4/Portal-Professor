import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Download, FileText, Loader2, Plus, X } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { InitialsAvatar } from "@/components/shared/InitialsAvatar";
import { useAuth } from "@/hooks/useAuth";
import { cn, formatGrade } from "@/lib/utils";
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

const TONE_TEXT = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

const PILL = "px-[11px] py-[5px] text-[11.5px]";

function absenceText(absences: number, max: number) {
  const pct = (absences / Math.max(max, 1)) * 100;
  return pct >= 80 ? TONE_TEXT.destructive : pct >= 50 ? TONE_TEXT.warning : "text-muted-foreground";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-muted-foreground">
      {children}
    </h3>
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
    <div className="mt-2.5 flex gap-2">
      <select
        aria-label="Matricular em módulo"
        value={moduleId}
        onChange={(e) => setModuleId(e.target.value)}
        className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

  const modules = (student?.enrolled_modules ?? []).map((mod) => ({
    mod,
    ...STATUS_BADGE[classifyStatus(mod.final_grade, mod.absences, mod.max_absences)],
  }));
  // Resumo do topo: quantos módulos em cada situação que não é aprovado.
  const pending = new Map<string, { variant: keyof typeof TONE_TEXT; count: number }>();
  for (const { label, variant } of modules) {
    if (variant === "success") continue;
    pending.set(label, { variant, count: (pending.get(label)?.count ?? 0) + 1 });
  }
  const certificates = student?.medical_certificates ?? 0;

  return (
    <Sheet open={!!studentId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto bg-card p-0 sm:max-w-[436px]"
      >
        {isLoading || !student ? (
          <div className="space-y-3 p-5 pt-12">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            {/* pr-12: espaço para o X do Sheet */}
            <SheetHeader className="flex-row items-start gap-[13px] space-y-0 border-b px-5 py-[18px] pr-12 text-left sm:text-left">
              <InitialsAvatar name={student.full_name} className="h-11 w-11 text-sm" />
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-lg tracking-[-0.015em]">
                  {student.full_name}
                </SheetTitle>
                <SheetDescription className="mt-[3px] font-mono text-xs">
                  {student.student_number} · matriculado{" "}
                  {format(new Date(student.enrollment_date + "T12:00:00"), "dd/MM/yyyy", {
                    locale: ptBR,
                  })}
                </SheetDescription>
              </div>
            </SheetHeader>

            <div className="flex flex-col gap-4 px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant={student.is_active ? "success" : "secondary"} className={PILL}>
                  {student.is_active ? "Ativo" : "Inativo"}
                </Badge>
                {[...pending].map(([label, { variant, count }]) => (
                  <Badge key={label} variant={variant} className={PILL}>
                    {label} em {count} módulo{count !== 1 ? "s" : ""}
                  </Badge>
                ))}
                {student.avg_final_grade != null && (
                  <Badge variant="secondary" className={cn(PILL, "font-mono")}>
                    Média {formatGrade(student.avg_final_grade)}
                  </Badge>
                )}
              </div>

              {(student.email || student.referral_info) && (
                <section className="space-y-2">
                  <SectionLabel>Contato</SectionLabel>
                  <dl className="overflow-hidden rounded-[10px] border text-[12.5px]">
                    {student.email && (
                      <div className="flex justify-between gap-2.5 border-b px-3 py-2.5 last:border-0">
                        <dt className="text-muted-foreground">E-mail</dt>
                        <dd className="min-w-0 break-all text-right font-semibold">
                          {student.email}
                        </dd>
                      </div>
                    )}
                    {student.referral_info && (
                      <div className="flex justify-between gap-2.5 border-b px-3 py-2.5 last:border-0">
                        <dt className="text-muted-foreground">Encaminhamento</dt>
                        <dd className="min-w-0 break-words text-right font-semibold">
                          {student.referral_info}
                        </dd>
                      </div>
                    )}
                  </dl>
                </section>
              )}

              {student.observations && (
                <section className="space-y-2">
                  <SectionLabel>Observações</SectionLabel>
                  <p className="rounded-[10px] border px-3 py-2.5 text-[12.5px]">
                    {student.observations}
                  </p>
                </section>
              )}

              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <SectionLabel>Módulos no período</SectionLabel>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-[30px] px-2.5"
                    onClick={() =>
                      downloadReport.mutate({
                        studentId: student.id,
                        studentName: student.full_name,
                      })
                    }
                    disabled={downloadReport.isPending}
                  >
                    {downloadReport.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Download />
                    )}
                    Baixar boletim
                  </Button>
                </div>

                {modules.length > 0 ? (
                  <ul className="overflow-hidden rounded-[10px] border">
                    {modules.map(({ mod, variant, label }) => (
                      <li
                        key={mod.enrollment_id}
                        className="flex items-center gap-2.5 border-b px-3 py-2.5 last:border-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[11.5px] font-semibold text-muted-foreground">
                            {mod.module_code} ·{" "}
                            <span className={TONE_TEXT[variant]}>{label}</span>
                          </p>
                          <p className="mt-0.5 truncate text-[13px] font-semibold">
                            {mod.module_name}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={cn("font-mono text-[15px] font-semibold", TONE_TEXT[variant])}>
                            {formatGrade(mod.final_grade)}
                          </p>
                          <p
                            className={cn(
                              "mt-0.5 font-mono text-[11px]",
                              absenceText(mod.absences, mod.max_absences),
                            )}
                          >
                            {mod.absences}/{mod.max_absences} faltas
                          </p>
                        </div>
                        {canManageEnrollments && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                            aria-label={`Desmatricular de ${mod.module_name}`}
                            disabled={unenroll.isPending}
                            onClick={() => handleUnenroll(mod)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12.5px] text-muted-foreground">
                    Sem matrícula em módulos.
                  </p>
                )}

                {canManageEnrollments && <EnrollmentPicker student={student} />}
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <SectionLabel>Atestados</SectionLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-[30px] px-2.5"
                    onClick={() => setCertificatesOpen(true)}
                    aria-label="Gerenciar atestados médicos"
                  >
                    <FileText />
                    Gerenciar
                  </Button>
                </div>
                <div className="flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5">
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-accent text-muted-foreground">
                    <FileText className="h-[15px] w-[15px]" />
                  </span>
                  <p className="text-[12.5px] font-semibold">
                    {certificates === 0
                      ? "Nenhum atestado registrado"
                      : `${certificates} atestado${certificates !== 1 ? "s" : ""} médico${certificates !== 1 ? "s" : ""}`}
                  </p>
                </div>
              </section>
            </div>

            {canEdit && student.is_active && (
              <div className="sticky bottom-0 mt-auto flex gap-2 border-t bg-card px-5 py-3">
                <Button
                  className="h-[42px] flex-1 rounded-[10px] text-[13.5px] font-semibold"
                  onClick={() => onEdit(student)}
                >
                  Editar aluno
                </Button>
                <Button
                  variant="outline"
                  className="h-[42px] rounded-[10px] border-destructive/30 px-3.5 text-[13.5px] font-semibold text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onDeactivate(student)}
                >
                  Desativar
                </Button>
              </div>
            )}
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
