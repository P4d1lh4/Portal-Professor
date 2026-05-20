import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  studentsApi,
  type ListPeriodStudentsParams,
  type StudentCreate,
  type StudentUpdate,
} from "./api";

export const STUDENTS_KEY = ["students"] as const;

export function useStudentsByPeriod(
  periodId: string | undefined,
  params: ListPeriodStudentsParams = {},
) {
  return useQuery({
    queryKey: [...STUDENTS_KEY, { periodId, ...params }],
    queryFn: () => studentsApi.listByPeriod(periodId!, params),
    enabled: !!periodId,
    placeholderData: keepPreviousData,
  });
}

export function useProfessorStudents() {
  return useQuery({
    queryKey: [...STUDENTS_KEY, "professor"],
    queryFn: studentsApi.listProfessor,
  });
}

export function useStudentDetail(studentId: string | undefined) {
  return useQuery({
    queryKey: [...STUDENTS_KEY, studentId],
    queryFn: () => studentsApi.getDetail(studentId!),
    enabled: !!studentId,
  });
}

export function useCreateStudentInPeriod(periodId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StudentCreate) =>
      studentsApi.createInPeriod(periodId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STUDENTS_KEY });
      toast.success("Aluno adicionado com sucesso.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCreateProfessorStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: studentsApi.createProfessor,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STUDENTS_KEY });
      toast.success("Aluno adicionado e matriculado nos seus módulos.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: StudentUpdate }) =>
      studentsApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STUDENTS_KEY });
      toast.success("Aluno atualizado com sucesso.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeactivateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: studentsApi.deactivate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STUDENTS_KEY });
      toast.success("Aluno desativado.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
