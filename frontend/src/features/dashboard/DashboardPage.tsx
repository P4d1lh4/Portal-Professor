import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BookOpen,
  GraduationCap,
  TrendingUp,
  Users,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/axios";
import { useActivePeriods } from "@/features/periods/usePeriods";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 flex items-start gap-4">
      <div className="rounded-lg bg-primary/10 p-2.5 flex-shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold tabular-nums mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Chart ────────────────────────────────────────────────────────────────────

const BUCKET_COLORS: Record<string, string> = {
  "9–10": "hsl(var(--success))",
  "7–8.9": "hsl(var(--primary))",
  "5–6.9": "hsl(var(--warning))",
  "0–4.9": "hsl(var(--destructive))",
};

function GradeDistChart({ data }: { data: GradeBucket[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Nenhuma nota lançada ainda.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "13px",
          }}
          formatter={(v: number) => [v, "alunos"]}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.label} fill={BUCKET_COLORS[d.label] ?? "hsl(var(--primary))"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
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
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Código</TableHead>
            <TableHead>Nome</TableHead>
            {showProfessor && <TableHead>Professor</TableHead>}
            <TableHead className="w-20 text-center">Alunos</TableHead>
            <TableHead className="w-24 text-center">Aprovados</TableHead>
            <TableHead className="w-28 text-center">Rep. faltas</TableHead>
            <TableHead className="w-24 text-center">Aprovação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <span className="font-mono text-xs font-semibold text-muted-foreground">
                  {m.code}
                </span>
              </TableCell>
              <TableCell className="font-medium text-sm">{m.name}</TableCell>
              {showProfessor && (
                <TableCell className="text-sm text-muted-foreground">
                  {m.professor ?? "—"}
                </TableCell>
              )}
              <TableCell className="text-center font-mono text-sm">
                {m.students}
              </TableCell>
              <TableCell className="text-center">
                <span className="font-mono text-sm text-success">{m.approved}</span>
              </TableCell>
              <TableCell className="text-center">
                <span className="font-mono text-sm text-destructive">{m.reproved_abs}</span>
              </TableCell>
              <TableCell className="text-center">
                <Badge
                  variant={
                    m.approval_rate >= 70
                      ? "success"
                      : m.approval_rate >= 50
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {m.approval_rate}%
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
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
  const isCoordOrAdmin =
    profile?.role === "coordinator" || profile?.role === "admin";

  const { data: activePeriods = [] } = useActivePeriods();
  const [periodId, setPeriodId] = useState("");
  const selectedPeriod = periodId || activePeriods[0]?.id;

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard", selectedPeriod ?? ""],
    queryFn: () =>
      api
        .get("/api/dashboard", {
          params: selectedPeriod ? { period_id: selectedPeriod } : undefined,
        })
        .then((r) => r.data),
    enabled: !!profile,
  });

  const modules = data?.modules_detail ?? data?.modules_breakdown ?? [];
  const dist = data?.grade_distribution ?? [];
  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Olá, {profile?.full_name.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {ROLE_LABEL[profile?.role ?? ""] ?? ""}
          </p>
        </div>

        {isCoordOrAdmin && activePeriods.length > 1 && (
          <Select
            value={selectedPeriod ?? ""}
            onValueChange={setPeriodId}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              {activePeriods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-60 rounded-xl" />
        </div>
      ) : !data ? null : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {isProfessor ? (
              <>
                <StatCard
                  icon={BookOpen}
                  label="Módulos"
                  value={summary?.modules ?? 0}
                />
                <StatCard
                  icon={Users}
                  label="Alunos (total)"
                  value={summary?.students ?? 0}
                />
                <StatCard
                  icon={GraduationCap}
                  label="Aprovados"
                  value={summary?.approvals ?? 0}
                />
                <StatCard
                  icon={TrendingUp}
                  label="Taxa de aprovação"
                  value={`${summary?.approval_rate ?? 0}%`}
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
                <StatCard
                  icon={BookOpen}
                  label="Módulos"
                  value={summary?.modules ?? 0}
                />
                <StatCard
                  icon={GraduationCap}
                  label="Aprovados"
                  value={summary?.approved ?? 0}
                  sub={`de ${summary?.enrollments ?? 0} matrículas`}
                />
                <StatCard
                  icon={TrendingUp}
                  label="Taxa de aprovação"
                  value={`${summary?.approval_rate ?? 0}%`}
                />
              </>
            )}
          </div>

          {/* Charts + table */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Grade distribution */}
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h2 className="font-semibold text-sm">Distribuição de notas finais</h2>
              <GradeDistChart data={dist} />
            </div>

            {/* Módulos breakdown */}
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h2 className="font-semibold text-sm">
                {isProfessor ? "Seus módulos" : "Módulos do período"}
              </h2>
              <ModulesTable
                rows={modules}
                showProfessor={!isProfessor}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
