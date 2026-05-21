// Regra única de classificação de situação do aluno (espelho do
// backend services/classification.py). Reprovado por faltas tem prioridade;
// depois final >= 7 aprova, 5 <= final < 7 é recuperação, abaixo reprova.

export type Status = "rep_faltas" | "aprovado" | "recuperacao" | "reprovado";

export function classifyStatus(
  finalGrade: number,
  absences: number,
  maxAbsences: number,
): Status {
  if (absences > maxAbsences) return "rep_faltas";
  if (finalGrade >= 7) return "aprovado";
  if (finalGrade >= 5) return "recuperacao";
  return "reprovado";
}

export const STATUS_LABELS: Record<Status, string> = {
  rep_faltas: "Rep. faltas",
  aprovado: "Aprovado",
  recuperacao: "Recuperação",
  reprovado: "Reprovado",
};
