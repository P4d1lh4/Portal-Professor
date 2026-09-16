import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { CheckCircle2, Loader2, TriangleAlert, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSelectedPeriod } from "@/features/periods/useSelectedPeriod";
import api from "@/lib/axios";
import { cn, formatFileSize } from "@/lib/utils";

interface ValidRow {
  student_number: string;
  full_name: string;
  enrollment_date: string;
  email?: string;
}

interface InvalidRow {
  line: number;
  raw: Record<string, string>;
  error: string;
}

interface PreviewResult {
  dry_run: true;
  total: number;
  valid_count: number;
  invalid_count: number;
  valid: ValidRow[];
  invalid: InvalidRow[];
}

interface ImportResult {
  dry_run: false;
  total: number;
  imported: number;
  invalid_count: number;
  invalid: InvalidRow[];
  errors_on_save: string[];
}

type Phase = "idle" | "preview" | "done";

async function callImport(
  periodId: string,
  file: File,
  dryRun: boolean
): Promise<PreviewResult | ImportResult> {
  const form = new FormData();
  form.append("file", file);
  const resp = await api.post(
    `/api/periods/${periodId}/students/import?dry_run=${dryRun}`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return resp.data;
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <>
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-primary font-mono text-[11px] font-semibold text-primary-foreground">
        {n}
      </span>
      <h2 className="text-[13.5px] font-semibold">{children}</h2>
    </>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function ImportPage() {
  const { profile } = useAuth();
  const canImport = profile?.role === "coordinator" || profile?.role === "admin";

  // O período vem da barra superior. A tela só importa para período ativo,
  // como antes (a lista antiga só oferecia os ativos).
  const { period, periodId = "", isLoading: periodsLoading } = useSelectedPeriod();
  const periodOk = !!period?.is_active;
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  // Prévia/resultado valem só para o período em que foram gerados: trocar o
  // período na barra superior não pode importar a prévia de outro.
  const [phaseFor, setPhaseFor] = useState("");
  const view: Phase = phaseFor === periodId ? phase : "idle";

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      setFile(accepted[0]);
      setPhase("idle");
      setPreview(null);
      setResult(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"], "text/plain": [".txt", ".csv"] },
    maxFiles: 1,
  });

  const handlePreview = async () => {
    if (!file || !periodId || !periodOk) return;
    setLoading(true);
    try {
      const data = await callImport(periodId, file, true);
      setPreview(data as PreviewResult);
      setPhaseFor(periodId);
      setPhase("preview");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Erro ao processar o arquivo.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!file || !periodId || !periodOk) return;
    setLoading(true);
    try {
      const data = await callImport(periodId, file, false);
      setResult(data as ImportResult);
      setPhase("done");
      toast.success(`${(data as ImportResult).imported} alunos importados com sucesso.`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Erro ao importar.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPhase("idle");
    setPreview(null);
    setResult(null);
  };

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Dados"
        title="Importação de alunos"
        description={
          periodOk
            ? `Os alunos entram em ${period?.name}.`
            : "Importe alunos em lote via arquivo CSV."
        }
      />

      {!canImport ? (
        <p className="text-sm text-muted-foreground">
          Apenas coordenadores e administradores podem importar alunos.
        </p>
      ) : (
        <>
          {!periodsLoading && !periodOk && (
            <p
              role="status"
              className="flex items-center gap-2.5 rounded-[10px] border border-warning/30 bg-warning/10 px-3.5 py-3 text-[12.5px] font-semibold text-warning"
            >
              <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              Escolha um período ativo na barra superior.
            </p>
          )}

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] items-start gap-3">
            {/* Passo 1 — Arquivo */}
            <section className="rounded-xl border bg-card p-[18px]">
              <div className="mb-3.5 flex items-center gap-[9px]">
                <StepTitle n={1}>Arquivo</StepTitle>
              </div>

              <div
                {...getRootProps()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed p-[26px] text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isDragActive
                    ? "border-foreground bg-accent"
                    : "border-border bg-muted/40 hover:border-foreground hover:bg-accent/60"
                )}
              >
                <input {...getInputProps()} />
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border bg-card">
                  <Upload className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <p className="break-all text-[13.5px] font-semibold">
                  {file ? file.name : "Escolher arquivo CSV"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isDragActive
                    ? "Solte o arquivo aqui…"
                    : file
                      ? `${formatFileSize(file.size)} · trocar arquivo`
                      : "ou arraste o arquivo para cá"}
                </p>
              </div>

              <div className="mt-3.5 rounded-[10px] border bg-muted/40 px-3.5 py-3">
                <p className="mb-1.5 text-xs font-semibold">Colunas obrigatórias</p>
                <p className="font-mono text-[11.5px] leading-relaxed text-muted-foreground">
                  Matrícula · Nome · Data de matrícula
                </p>
                <p className="mb-1.5 mt-2.5 text-xs font-semibold">Opcionais</p>
                <p className="font-mono text-[11.5px] leading-relaxed text-muted-foreground">
                  E-mail · Encaminhamento · Observações
                </p>
                <p className="mt-2.5 text-[11.5px] text-muted-foreground">
                  O CSV exportado pelo sistema pode ser reimportado como está. Data em
                  AAAA-MM-DD ou DD/MM/AAAA; também valem os nomes técnicos
                  (student_number, full_name, enrollment_date…).
                </p>
              </div>
            </section>

            {/* Passo 2 — Prévia / resultado */}
            <section className="rounded-xl border bg-card p-[18px]">
              {view === "done" && result ? (
                <div className="space-y-3.5">
                  <div className="flex items-center gap-[9px]">
                    <StepTitle n={2}>Resultado</StepTitle>
                  </div>

                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-8 w-8 shrink-0 text-success" aria-hidden="true" />
                    <div>
                      <p className="text-[13.5px] font-semibold">
                        {plural(result.imported, "aluno importado", "alunos importados")} com sucesso
                      </p>
                      {result.invalid_count > 0 && (
                        <p className="text-[12.5px] text-muted-foreground">
                          {plural(result.invalid_count, "linha ignorada", "linhas ignoradas")} por erro.
                        </p>
                      )}
                    </div>
                  </div>

                  {result.errors_on_save.length > 0 && (
                    <div className="space-y-1 rounded-[10px] border border-destructive/30 bg-destructive/10 px-3 py-2.5">
                      <p className="flex items-center gap-1 text-xs font-semibold text-destructive">
                        <XCircle className="h-3 w-3" aria-hidden="true" />
                        Erros durante a gravação
                      </p>
                      {result.errors_on_save.map((e, i) => (
                        <p key={i} className="break-all font-mono text-[11px] text-muted-foreground">
                          {e}
                        </p>
                      ))}
                    </div>
                  )}

                  <Button variant="outline" className="h-[42px] font-semibold" onClick={reset}>
                    Nova importação
                  </Button>
                </div>
              ) : view === "preview" && preview ? (
                <>
                  <div className="mb-3.5 flex flex-wrap items-center gap-[9px]">
                    <StepTitle n={2}>
                      Prévia — {plural(preview.total, "linha", "linhas")}
                    </StepTitle>
                    <div className="ml-auto flex gap-1.5">
                      <Badge variant="success" className="px-2.5 py-1 text-[11.5px]">
                        {preview.valid_count} válidas
                      </Badge>
                      {preview.invalid_count > 0 && (
                        <Badge variant="destructive" className="px-2.5 py-1 text-[11.5px]">
                          {preview.invalid_count} com erro
                        </Badge>
                      )}
                    </div>
                  </div>

                  {preview.valid.length > 0 && (
                    <ul
                      aria-label="Alunos a importar"
                      className="mb-3 max-h-80 overflow-y-auto rounded-[10px] border"
                    >
                      {preview.valid.map((r, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-3 border-b px-3 py-[9px] last:border-b-0"
                        >
                          <span className="w-[74px] shrink-0 truncate font-mono text-[11.5px] text-muted-foreground">
                            {r.student_number}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                            {r.full_name}
                          </span>
                          <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">
                            {r.enrollment_date.split("-").reverse().join("/")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {preview.invalid.length > 0 && (
                    <ul
                      aria-label="Linhas com erro (serão ignoradas)"
                      className="max-h-80 overflow-y-auto rounded-[10px] border border-destructive/30 bg-destructive/10"
                    >
                      {preview.invalid.map((r, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-3 border-b border-destructive/20 px-3 py-[9px] last:border-b-0"
                        >
                          <span className="w-[52px] shrink-0 font-mono text-[11.5px] text-destructive">
                            L{r.line}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] font-semibold text-destructive">
                              {r.error.replace(/^Linha \d+: /, "")}
                            </p>
                            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                              {Object.values(r.raw).join(";")}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      className="h-[42px] font-semibold"
                      onClick={handleConfirm}
                      disabled={preview.valid_count === 0 || loading || !periodOk}
                    >
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      Importar {plural(preview.valid_count, "aluno", "alunos")}
                    </Button>
                    <Button variant="outline" className="h-[42px] font-semibold" onClick={reset}>
                      Cancelar
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-3.5 flex items-center gap-[9px]">
                    <StepTitle n={2}>Prévia</StepTitle>
                  </div>
                  <p className="text-[12.5px] text-muted-foreground">
                    Escolha o arquivo e confira a prévia antes de importar. Nada é
                    gravado até você confirmar.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      className="h-[42px] font-semibold"
                      onClick={handlePreview}
                      disabled={!file || !periodOk || loading}
                    >
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      Visualizar prévia
                    </Button>
                    {file && (
                      <Button variant="outline" className="h-[42px] font-semibold" onClick={reset}>
                        Limpar
                      </Button>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
