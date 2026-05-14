import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { gradesApi, type GradeUpdate } from "./api";

export const gradeKey = (moduleId: string) => ["grades", moduleId];

export function useModuleGrades(moduleId: string | undefined) {
  return useQuery({
    queryKey: gradeKey(moduleId ?? ""),
    queryFn: () => gradesApi.getByModule(moduleId!),
    enabled: !!moduleId,
  });
}

export function useUpdateGrade(moduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ enrollmentId, body }: { enrollmentId: string; body: GradeUpdate }) =>
      gradesApi.update(enrollmentId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: gradeKey(moduleId) });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
