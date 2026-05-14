import { cn } from "@/lib/utils";

interface GradeBadgeProps {
  finalGrade: number;
  absences: number;
  maxAbsences: number;
  className?: string;
}

export function GradeBadge({ finalGrade, absences, maxAbsences, className }: GradeBadgeProps) {
  const failedByAbsence = absences > maxAbsences;

  if (failedByAbsence) {
    return (
      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive", className)}>
        Rep. faltas
      </span>
    );
  }
  if (finalGrade >= 7) {
    return (
      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full bg-success/15 text-success", className)}>
        Aprovado
      </span>
    );
  }
  if (finalGrade >= 5) {
    return (
      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full bg-warning/15 text-warning", className)}>
        Recuperação
      </span>
    );
  }
  return (
    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive", className)}>
      Reprovado
    </span>
  );
}
