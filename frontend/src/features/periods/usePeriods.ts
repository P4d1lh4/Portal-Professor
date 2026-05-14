import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { periodsApi, type PeriodUpdate } from "./api";

export const PERIODS_KEY = ["periods"] as const;

export function usePeriods() {
  return useQuery({
    queryKey: PERIODS_KEY,
    queryFn: periodsApi.list,
  });
}

export function useActivePeriods() {
  return useQuery({
    queryKey: [...PERIODS_KEY, "active"],
    queryFn: periodsApi.listActive,
  });
}

export function useCreatePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: periodsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PERIODS_KEY });
      toast.success("Período acadêmico criado com sucesso.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdatePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PeriodUpdate }) =>
      periodsApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PERIODS_KEY });
      toast.success("Período atualizado com sucesso.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeletePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: periodsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PERIODS_KEY });
      toast.success("Período excluído.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
