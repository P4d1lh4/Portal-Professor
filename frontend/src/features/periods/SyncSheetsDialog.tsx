import { useState } from "react";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import api from "@/lib/axios";
import { PERIODS_KEY } from "./usePeriods";

interface SyncResult {
  updated: number;
  not_found: string[];
  not_found_count: number;
  synced_at: string;
}

interface SyncSheetsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodId: string;
  periodName: string;
  currentUrl?: string | null;
}

export function SyncSheetsDialog({
  open,
  onOpenChange,
  periodId,
  periodName,
  currentUrl,
}: SyncSheetsDialogProps) {
  const qc = useQueryClient();
  const [url, setUrl] = useState(currentUrl ?? "");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const saveUrl = useMutation({
    mutationFn: () =>
      api
        .put(`/api/periods/${periodId}/sync-url`, { csv_sync_url: url.trim() })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PERIODS_KEY });
      toast.success("URL salva.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const syncNow = useMutation({
    mutationFn: () =>
      api
        .post<SyncResult>(`/api/periods/${periodId}/sync-sheets`)
        .then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: PERIODS_KEY });
      setSyncResult(data);
      toast.success(`${data.updated} alunos sincronizados.`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleClose = () => {
    setSyncResult(null);
    onOpenChange(false);
  };

  const isBusy = saveUrl.isPending || syncNow.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sincronizar Google Sheets</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Período: <span className="font-medium text-foreground">{periodName}</span>
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="sheets-url">URL de exportação CSV da planilha</Label>
            <Input
              id="sheets-url"
              placeholder="https://docs.google.com/spreadsheets/…/export?format=csv"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              No Google Sheets: Arquivo → Fazer download → CSV, ou use o link de
              publicação na web com formato CSV.
            </p>
          </div>

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground select-none">
              Formato esperado da planilha
            </summary>
            <div className="mt-2 rounded-md bg-muted p-3 font-mono leading-relaxed">
              <p>Colunas (ordem livre):</p>
              <p className="mt-1">student_number, tutor_grade,</p>
              <p>regular_exam_grade, makeup_exam_grade, absences</p>
            </div>
          </details>

          {/* Resultado do último sync */}
          {syncResult && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2 text-success text-sm font-medium">
                <CheckCircle2 className="h-4 w-4" />
                {syncResult.updated} aluno{syncResult.updated !== 1 ? "s" : ""} atualizados
              </div>
              {syncResult.not_found_count > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {syncResult.not_found_count} matrícula
                    {syncResult.not_found_count !== 1 ? "s" : ""} não encontrada
                    {syncResult.not_found_count !== 1 ? "s" : ""}:
                  </p>
                  <p className="text-xs font-mono text-muted-foreground">
                    {syncResult.not_found.slice(0, 10).join(", ")}
                    {syncResult.not_found.length > 10 ? "…" : ""}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => saveUrl.mutate()}
            disabled={isBusy}
          >
            {saveUrl.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar URL
          </Button>
          <Button
            onClick={() => syncNow.mutate()}
            disabled={isBusy || !url.trim()}
          >
            {syncNow.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sincronizar agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
