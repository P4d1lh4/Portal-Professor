import { classifyStatus, type Status } from "@/lib/classification";
import type { StudentGradeRow } from "./api";

/** Filtro da tela de Notas (F-S1): uma situação da regra única ou "em risco". */
export type Situation = "" | Status | "risco";

export const SITUATION_OPTIONS: {
  value: Situation;
  label: string;
  tone?: "warning" | "destructive";
}[] = [
  { value: "", label: "Todos" },
  { value: "risco", label: "Em risco", tone: "warning" },
  { value: "recuperacao", label: "Recuperação", tone: "warning" },
  { value: "rep_faltas", label: "Rep. faltas", tone: "destructive" },
  { value: "reprovado", label: "Reprovado", tone: "destructive" },
  { value: "aprovado", label: "Aprovado" },
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
