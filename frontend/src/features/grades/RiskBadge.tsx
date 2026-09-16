import { AlertTriangle } from "lucide-react";

import { useModuleGrades } from "./useGrades";

/**
 * Alerta de aluno em risco (P-N1): faltas perto do limite ou nota abaixo de 5.
 * Lê a mesma query da tela de Notas: o TanStack compartilha o cache, então as
 * linhas não geram uma requisição cada.
 */
export function RiskBadge({
  moduleId,
  enrollmentId,
}: {
  moduleId: string | undefined;
  enrollmentId: string;
}) {
  const { data } = useModuleGrades(moduleId);
  const reasons = data?.find((r) => r.enrollment_id === enrollmentId)?.risk ?? [];
  if (reasons.length === 0) return null;

  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold text-warning">
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      Em risco: {reasons.join(" e ")}
    </span>
  );
}
