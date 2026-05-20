import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { exportsApi } from "./api";

export function useDownloadPeriodStudents() {
  return useMutation({
    mutationFn: ({
      periodId,
      periodName,
    }: {
      periodId: string;
      periodName: string;
    }) => exportsApi.downloadPeriodStudents(periodId, periodName),
    onError: (err: Error) =>
      toast.error(`Erro ao exportar alunos: ${err.message}`),
    onSuccess: () => toast.success("Arquivo CSV gerado."),
  });
}

export function useDownloadModuleGrades() {
  return useMutation({
    mutationFn: ({
      moduleId,
      moduleCode,
    }: {
      moduleId: string;
      moduleCode: string;
    }) => exportsApi.downloadModuleGrades(moduleId, moduleCode),
    onError: (err: Error) =>
      toast.error(`Erro ao exportar notas: ${err.message}`),
    onSuccess: () => toast.success("Arquivo CSV gerado."),
  });
}
