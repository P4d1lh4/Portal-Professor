import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { CheckCircle2, FileText, Loader2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActivePeriods } from "@/features/periods/usePeriods";
import api from "@/lib/axios";

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

export default function ImportPage() {
  const { profile } = useAuth();
  const canImport = profile?.role === "coordinator" || profile?.role === "admin";

  const { data: periods = [], isLoading: periodsLoading } = useActivePeriods();
  const [periodId, setPeriodId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

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
    if (!file || !periodId) return;
    setLoading(true);
    try {
      const data = await callImport(periodId, file, true);
      setPreview(data as PreviewResult);
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
    if (!file || !periodId) return;
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
    <div className="space-y-6">
      <PageHeader
        title="Importação de Alunos"
        description="Importe alunos em lote via arquivo CSV."
      />

      {!canImport ? (
        <p className="text-sm text-muted-foreground">
          Apenas coordenadores e administradores podem importar alunos.
        </p>
      ) : (
        <>
          {/* Step 1 — Configuração */}
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <h2 className="font-semibold text-sm">1. Selecione o período e o arquivo</h2>

            {periodsLoading ? (
              <Skeleton className="h-9 w-52" />
            ) : (
              <Select value={periodId} onValueChange={setPeriodId}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Selecione um período" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Dropzone */}
            <div
              {...getRootProps()}
              className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors ${
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-accent/30"
              }`}
            >
              <input {...getInputProps()} />
              {file ? (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-5 w-5 text-primary" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-muted-foreground">
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground text-center">
                    {isDragActive
                      ? "Solte o arquivo aqui…"
                      : "Arraste um arquivo CSV ou clique para selecionar"}
                  </p>
                </>
              )}
            </div>

            {/* Hint sobre colunas */}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">
                Formato esperado do CSV
              </summary>
              <div className="mt-2 rounded-md bg-muted p-3 font-mono leading-relaxed">
                <p className="font-semibold mb-1">Colunas obrigatórias:</p>
                <p>student_number, full_name, enrollment_date</p>
                <p className="font-semibold mt-2 mb-1">Colunas opcionais:</p>
                <p>email, medical_certificates, referral_info, observations</p>
                <p className="font-semibold mt-2 mb-1">Exemplo:</p>
                <p>student_number,full_name,enrollment_date</p>
                <p>2024001,Ana Silva,2024-02-01</p>
                <p>2024002,Bruno Costa,2024-02-01</p>
              </div>
            </details>

            <div className="flex gap-2">
              <Button
                onClick={handlePreview}
                disabled={!file || !periodId || loading}
              >
                {loading && phase === "idle" && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Visualizar prévia
              </Button>
              {(file || phase !== "idle") && (
                <Button variant="outline" onClick={reset}>
                  Limpar
                </Button>
              )}
            </div>
          </div>

          {/* Step 2 — Preview */}
          {phase === "preview" && preview && (
            <div className="rounded-xl border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm">
                  2. Prévia — {preview.total} linha
                  {preview.total !== 1 ? "s" : ""} no arquivo
                </h2>
                <div className="flex gap-2">
                  <Badge variant="success">{preview.valid_count} válidas</Badge>
                  {preview.invalid_count > 0 && (
                    <Badge variant="destructive">
                      {preview.invalid_count} inválidas
                    </Badge>
                  )}
                </div>
              </div>

              {/* Valid rows */}
              {preview.valid.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                    Alunos a importar
                  </p>
                  <div className="rounded-lg border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-28">Matrícula</TableHead>
                          <TableHead>Nome</TableHead>
                          <TableHead className="w-32">Data matrícula</TableHead>
                          <TableHead>E-mail</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.valid.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">
                              {r.student_number}
                            </TableCell>
                            <TableCell className="text-sm">{r.full_name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {r.enrollment_date}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {r.email ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Invalid rows */}
              {preview.invalid.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-destructive mb-2 uppercase tracking-wide">
                    Linhas com erro (serão ignoradas)
                  </p>
                  <div className="rounded-lg border border-destructive/30 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Linha</TableHead>
                          <TableHead>Erro</TableHead>
                          <TableHead>Dados recebidos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.invalid.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">
                              {r.line}
                            </TableCell>
                            <TableCell className="text-xs text-destructive">
                              {r.error}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground font-mono">
                              {Object.values(r.raw).filter(Boolean).join(" · ")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleConfirm}
                  disabled={preview.valid_count === 0 || loading}
                >
                  {loading && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Confirmar importação ({preview.valid_count} alunos)
                </Button>
                <Button variant="outline" onClick={reset}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Step 3 — Result */}
          {phase === "done" && result && (
            <div className="rounded-xl border bg-card p-6 space-y-4">
              <h2 className="font-semibold text-sm">3. Resultado</h2>

              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-success flex-shrink-0" />
                <div>
                  <p className="font-medium">
                    {result.imported} aluno
                    {result.imported !== 1 ? "s" : ""} importado
                    {result.imported !== 1 ? "s" : ""} com sucesso
                  </p>
                  {result.invalid_count > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {result.invalid_count} linha
                      {result.invalid_count !== 1 ? "s" : ""} ignorada
                      {result.invalid_count !== 1 ? "s" : ""} por erro.
                    </p>
                  )}
                </div>
              </div>

              {result.errors_on_save.length > 0 && (
                <div className="rounded-lg border border-destructive/30 p-3 space-y-1">
                  <p className="text-xs font-medium text-destructive flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    Erros durante a gravação
                  </p>
                  {result.errors_on_save.map((e, i) => (
                    <p key={i} className="text-xs text-muted-foreground font-mono">
                      {e}
                    </p>
                  ))}
                </div>
              )}

              <Button variant="outline" onClick={reset}>
                Nova importação
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
