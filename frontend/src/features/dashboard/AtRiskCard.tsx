import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

import { formatGrade } from "@/lib/utils";

export interface AtRiskItem {
  enrollment_id: string;
  module_id: string;
  module_code: string;
  full_name: string;
  student_number: string;
  absences: number;
  max_absences: number;
  final_grade: number;
  reasons: string[];
}

const VISIBLE = 8;

/** Alunos em risco nos módulos do professor (P-N1), do mais urgente ao menos. */
export function AtRiskCard({ items }: { items: AtRiskItem[] }) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <h2 className="flex items-center gap-2 font-semibold text-sm">
        <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
        Alunos em risco
        <span className="font-normal text-muted-foreground">({items.length})</span>
      </h2>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum aluno perto do limite de faltas ou com nota abaixo de 5.
        </p>
      ) : (
        <ul className="divide-y text-sm">
          {items.slice(0, VISIBLE).map((r) => (
            <li key={r.enrollment_id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.module_code} · {r.absences}/{r.max_absences} faltas · final{" "}
                  {formatGrade(r.final_grade)} · risco: {r.reasons.join(" e ")}
                </p>
              </div>
              <Link
                to={`/grades?module=${r.module_id}`}
                className="shrink-0 text-xs font-medium text-primary hover:underline"
              >
                Ver notas
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items.length > VISIBLE && (
        <p className="text-xs text-muted-foreground">e mais {items.length - VISIBLE}.</p>
      )}
    </div>
  );
}
