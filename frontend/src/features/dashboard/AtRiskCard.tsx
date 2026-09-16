import { Link } from "react-router-dom";

import { formatGrade, initials } from "@/lib/utils";

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
    <section className="rounded-xl border bg-card px-[18px] pb-2.5 pt-4">
      <h2 className="mb-2 flex items-baseline gap-1.5 text-[13.5px]">
        Precisa de atenção
        <span className="font-mono text-xs font-normal text-muted-foreground">
          {items.length}
        </span>
      </h2>

      {items.length === 0 ? (
        <p className="pb-2 text-sm text-muted-foreground">
          Nenhum aluno perto do limite de faltas ou com nota abaixo de 5.
        </p>
      ) : (
        <ul>
          {items.slice(0, VISIBLE).map((r) => (
            <li key={r.enrollment_id} className="flex items-center gap-[11px] border-t py-[9px]">
              <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-muted-foreground"
                aria-hidden="true"
              >
                {initials(r.full_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{r.full_name}</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {r.module_code} · {r.absences}/{r.max_absences} faltas · final{" "}
                  {formatGrade(r.final_grade)} · risco: {r.reasons.join(" e ")}
                </p>
              </div>
              <Link
                to={`/grades?module=${r.module_id}`}
                className="shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Ver notas
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items.length > VISIBLE && (
        <p className="border-t pt-2 text-xs text-muted-foreground">
          e mais {items.length - VISIBLE}.
        </p>
      )}
    </section>
  );
}
