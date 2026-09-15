import { classifyStatus, type Status } from "@/lib/classification";
import type { StudentGradeRow } from "./api";

/** Filtro da tela de Notas (F-S1): uma situação da regra única ou "em risco". */
export type Situation = "" | Status | "risco";

export const SITUATION_OPTIONS: { value: Situation; label: string }[] = [
  { value: "", label: "Todas as situações" },
  { value: "risco", label: "Em risco" },
  { value: "aprovado", label: "Aprovado" },
  { value: "recuperacao", label: "Recuperação" },
  { value: "reprovado", label: "Reprovado por nota" },
  { value: "rep_faltas", label: "Reprovado por faltas" },
];

export function matchesSituation(
  row: StudentGradeRow,
  maxAbsences: number,
  situation: Situation,
): boolean {
  if (!situation) return true;
  // "Em risco" vem pronto do backend (risk_reasons, P-N1).
  if (situation === "risco") return (row.risk?.length ?? 0) > 0;
  return classifyStatus(row.final_grade, row.absences, maxAbsences) === situation;
}
