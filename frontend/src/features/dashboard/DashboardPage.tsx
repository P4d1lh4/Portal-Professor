import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  GraduationCap,
  TrendingUp,
  Users,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import api from "@/lib/axios";
import { AtRiskCard, type AtRiskItem } from "./AtRiskCard";
import { useSelectedPeriod } from "@/features/periods/useSelectedPeriod";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GradeBucket { label: string; count: number }

interface ModuleBreakdown {
  id: string;
  name: string;
  code: string;
  professor?: string;
  students: number;
  approved: number;
  reproved_abs: number;
  approval_rate: number;
  is_active?: boolean;
}

interface DashboardData {
  role: string;
  period?: { id: string; name: string; is_active: boolean } | null;
  summary: {
    students?: number;
    modules?: number;
    enrollments?: number;
    approvals?: number;
    approved?: number;
    approval_rate: number;
  };
  modules_detail?: ModuleBreakdown[];   // professor
  modules_breakdown?: ModuleBreakdown[]; // coord/admin
  grade_distribution: GradeBucket[];
  at_risk?: AtRiskItem[];               // professor
}

// ─── Tons ─────────────────────────────────────────────────────────────────────

type Tone = "neutral" | "success" | "warning" | "destructive";

// Régua da aprovação: ≥70% ok, ≥50% atenção, abaixo disso crítico.
const rateTone = (rate: number): Tone =>
  rate >= 70 ? "success" : rate >= 50 ? "warning" : "destructive";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

const TONE_BAR: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

const TONE_CHIP: Record<Tone, string> = {
  neutral: "bg-accent text-muted-foreground",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/15 text-destructive",
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-[15px]">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-[26px] w-[26px] items-center justify-center rounded-md",
            TONE_CHIP[tone],
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      </div>
      <p
        className={cn(
          "mt-3 font-mono text-[28px] font-semibold leading-none tracking-tight tabular-nums",
          TONE_TEXT[tone],
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-[7px] text-[11.5px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Distribuição ─────────────────────────────────────────────────────────────

const BUCKET_BAR: Record<string, string> = {
  "9–10": "bg-success/80",
  "7–8.9": "bg-success",
  "5–6.9": "bg-warning",
  "0–4.9": "bg-destructive",
};

function GradeDistribution({ data }: { data: GradeBucket[] }) {
  const max = Math.max(0, ...data.map((d) => d.count));
  if (max === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhuma nota lançada ainda.
      </p>
    );
  }
  // A API manda da faixa mais baixa para a mais alta; a lista mostra a melhor primeiro.
  return (
    <ul>
      {[...data].reverse().map((d) => (
        <li key={d.label} className="flex items-center gap-3 py-1.5">
          <span className="w-[52px] shrink-0 font-mono text-xs text-muted-foreground">
            {d.label}
          </span>
          <div className="h-[22px] flex-1 overflow-hidden rounded-[5px] bg-muted" aria-hidden="true">
            <div
              className={cn("h-full rounded-[5px]", BUCKET_BAR[d.label] ?? "bg-primary")}
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </div>
          <span className="w-[34px] shrink-0 text-right font-mono text-[12.5px] font-semibold tabular-nums">
            {d.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ─── Modules table ────────────────────────────────────────────────────────────

function ModulesTable({
  rows,
  showProfessor,
}: {
  rows: ModuleBreakdown[];
  showProfessor: boolean;
}) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Nenhum módulo encontrado.
      </p>
    );

  return (
    <Table className="min-w-[560px]">
      <TableHeader className="bg-transparent">
        <TableRow>
          <TableHead className="w-24 pl-0">Código</TableHead>
          <TableHead>Módulo</TableHead>
          {showProfessor && <TableHead>Professor</TableHead>}
          <TableHead className="w-20 text-right">Alunos</TableHead>
          <TableHead className="w-40 pr-0">Aprovação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((m) => {
          const tone = rateTone(m.approval_rate);
          return (
            <TableRow key={m.id}>
              <TableCell className="pl-0 font-mono text-xs font-semibold text-muted-foreground">
                {m.code}
              </TableCell>
              <TableCell className="text-[13.5px] font-semibold">{m.name}</TableCell>
              {showProfessor && (
                <TableCell className="text-[13px] text-muted-foreground">
                  {m.professor ?? "—"}
                </TableCell>
              )}
              <TableCell className="text-right font-mono text-[13px] tabular-nums">
                {m.students}
              </TableCell>
              <TableCell className="pr-0">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-accent" aria-hidden="true">
                    <div
                      className={cn("h-full rounded-[3px]", TONE_BAR[tone])}
                      style={{ width: `${Math.min(100, m.approval_rate)}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "w-[38px] text-right font-mono text-xs font-semibold tabular-nums",
                      TONE_TEXT[tone],
                    )}
                  >
                    {m.approval_rate}%
                  </span>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  coordinator: "Coordenador(a)",
  professor: "Professor(a)",
};

export default function DashboardPage() {
  const { profile } = useAuth();
  const isProfessor = profile?.role === "professor";
  // O período vem da barra superior (useSelectedPeriod).
  const { periodId, isLoading: periodsLoading } = useSelectedPeriod();

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard", periodId ?? ""],
    queryFn: () =>
      api
        .get("/api/dashboard", {
          params: periodId ? { period_id: periodId } : undefined,
        })
        .then((r) => r.data),
    enabled: !!profile && !periodsLoading,
  });

  const modules = data?.modules_detail ?? data?.modules_breakdown ?? [];
  const dist = data?.grade_distribution ?? [];
  const summary = data?.summary;
  const rate = summary?.approval_rate ?? 0;

  return (
    <div className="space-y-3.5">
      <PageHeader
        eyebrow={data?.period?.name ?? ROLE_LABEL[profile?.role ?? ""]}
        title="Visão geral do período"
      />

      {isLoading || periodsLoading ? (
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-60 rounded-xl" />
        </div>
      ) : !data ? null : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(178px,1fr))] gap-3">
            {isProfessor ? (
              <>
                <StatCard icon={BookOpen} label="Módulos" value={summary?.modules ?? 0} />
                <StatCard icon={Users} label="Alunos (total)" value={summary?.students ?? 0} />
                <StatCard
                  icon={GraduationCap}
                  label="Aprovados"
                  value={summary?.approvals ?? 0}
                  tone="success"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Taxa de aprovação"
                  value={`${rate}%`}
                  tone={rateTone(rate)}
                />
              </>
            ) : (
              <>
                <StatCard
                  icon={Users}
                  label="Alunos ativos"
                  value={summary?.students ?? 0}
                  sub={data.period?.name}
                />
                <StatCard icon={BookOpen} label="Módulos" value={summary?.modules ?? 0} />
                <StatCard
                  icon={GraduationCap}
                  label="Aprovados"
                  value={summary?.approved ?? 0}
                  sub={`de ${summary?.enrollments ?? 0} matrículas`}
                  tone="success"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Taxa de aprovação"
                  value={`${rate}%`}
                  tone={rateTone(rate)}
                />
              </>
            )}
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-3">
            <section className="rounded-xl border bg-card px-[18px] pb-[18px] pt-4">
              <h2 className="mb-3.5 text-[13.5px]">Distribuição de notas finais</h2>
              <GradeDistribution data={dist} />
            </section>

            {/* P-N1: quem o professor precisa olhar antes do fechamento */}
            {isProfessor && <AtRiskCard items={data.at_risk ?? []} />}
          </div>

          <section className="rounded-xl border bg-card px-[18px] pb-1.5 pt-4">
            <h2 className="mb-1.5 text-[13.5px]">
              {isProfessor ? "Seus módulos" : "Módulos do período"}
            </h2>
            <ModulesTable rows={modules} showProfessor={!isProfessor} />
          </section>
        </>
      )}
    </div>
  );
}
