import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { recalcFinal } from "@/lib/grades";
import { gradesApi, type GradeUpdate, type StudentGradeRow } from "./api";

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
  const key = gradeKey(moduleId);

  return useMutation({
    mutationFn: ({ enrollmentId, body }: { enrollmentId: string; body: GradeUpdate }) =>
      gradesApi.update(enrollmentId, body),

    // Optimistic update: aplica a nota na tabela na hora, antes da resposta do
    // servidor. Evita o flicker de recarregar a tabela inteira a cada célula
    // salva — crucial na tela de lançamento de notas (uso intensivo).
    onMutate: async ({ enrollmentId, body }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<StudentGradeRow[]>(key);

      qc.setQueryData<StudentGradeRow[]>(key, (old) =>
        old?.map((row) => {
          if (row.enrollment_id !== enrollmentId) return row;
          const merged: StudentGradeRow = {
            ...row,
            ...(body.tutor_grade != null && { tutor_grade: body.tutor_grade }),
            ...(body.regular_exam_grade != null && {
              regular_exam_grade: body.regular_exam_grade,
            }),
            ...(body.makeup_exam_grade != null && {
              makeup_exam_grade: body.makeup_exam_grade,
            }),
            ...(body.absences != null && { absences: body.absences }),
          };
          merged.final_grade = recalcFinal(
            merged.regular_exam_grade,
            merged.makeup_exam_grade,
          );
          return merged;
        }),
      );

      return { previous };
    },

    onError: (err: Error, vars, context) => {
      // Reverte APENAS a linha que falhou, preservando updates otimistas de
      // outras células editadas em paralelo (restaurar o snapshot inteiro
      // apagava essas edições concorrentes).
      const prevRow = context?.previous?.find(
        (r) => r.enrollment_id === vars.enrollmentId,
      );
      if (prevRow) {
        qc.setQueryData<StudentGradeRow[]>(key, (old) =>
          old?.map((row) =>
            row.enrollment_id === vars.enrollmentId ? prevRow : row,
          ),
        );
      }
      toast.error(err.message);
    },

    // Reconcilia com o servidor (ex.: final_grade autoritativo) ao fim.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}
