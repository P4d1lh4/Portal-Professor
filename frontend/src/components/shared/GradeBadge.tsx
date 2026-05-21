import { cn } from "@/lib/utils";
import { classifyStatus, STATUS_LABELS, type Status } from "@/lib/classification";

interface GradeBadgeProps {
  finalGrade: number;
  absences: number;
  maxAbsences: number;
  className?: string;
}

// Cor de cada situação. Aprovado em verde, recuperação em amarelo, os dois
// tipos de reprovação em vermelho.
const STATUS_CLASSES: Record<Status, string> = {
  aprovado: "bg-success/15 text-success",
  recuperacao: "bg-warning/15 text-warning",
  rep_faltas: "bg-destructive/15 text-destructive",
  reprovado: "bg-destructive/15 text-destructive",
};

export function GradeBadge({ finalGrade, absences, maxAbsences, className }: GradeBadgeProps) {
  const status = classifyStatus(finalGrade, absences, maxAbsences);
  return (
    <span
      className={cn(
        "text-xs font-semibold px-2 py-0.5 rounded-full",
        STATUS_CLASSES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
