import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { modulesApi, type ModuleCreate, type ModuleUpdate } from "./api";

export const MODULES_KEY = ["modules"] as const;

export function useModules(periodId?: string) {
  return useQuery({
    queryKey: periodId ? [...MODULES_KEY, { periodId }] : MODULES_KEY,
    queryFn: () => modulesApi.list(periodId),
  });
}

export function useModuleStudents(moduleId: string) {
  return useQuery({
    queryKey: [...MODULES_KEY, moduleId, "students"],
    queryFn: () => modulesApi.getStudents(moduleId),
    enabled: !!moduleId,
  });
}

export function useCreateModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: modulesApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MODULES_KEY });
      toast.success("Módulo criado com sucesso.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCreateModuleForPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ periodId, body }: { periodId: string; body: ModuleCreate }) =>
      modulesApi.createForPeriod(periodId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MODULES_KEY });
      toast.success("Módulo criado com sucesso.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ModuleUpdate }) =>
      modulesApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MODULES_KEY });
      toast.success("Módulo atualizado com sucesso.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: modulesApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MODULES_KEY });
      toast.success("Módulo excluído.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
