import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { reportsApi } from "./api";

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "documento";
}

export function useDownloadStudentReport() {
  return useMutation({
    mutationFn: ({ studentId, studentName }: { studentId: string; studentName: string }) =>
      reportsApi.downloadStudentReport(
        studentId,
        `boletim-${slugify(studentName)}.pdf`,
      ),
    onError: (err: Error) =>
      toast.error(`Erro ao gerar boletim: ${err.message}`),
    onSuccess: () => toast.success("Boletim gerado."),
  });
}

export function useDownloadPeriodReport() {
  return useMutation({
    mutationFn: ({ periodId, periodName }: { periodId: string; periodName: string }) =>
      reportsApi.downloadPeriodReport(
        periodId,
        `relatorio-${slugify(periodName)}.pdf`,
      ),
    onError: (err: Error) =>
      toast.error(`Erro ao gerar relatório: ${err.message}`),
    onSuccess: () => toast.success("Relatório gerado."),
  });
}
