import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { attendanceApi, type AttendanceSavePayload } from "./api";

export const ATTENDANCE_KEY = ["attendance"] as const;

export function useModuleAttendance(moduleId: string | undefined) {
  return useQuery({
    queryKey: [...ATTENDANCE_KEY, "list", moduleId ?? ""],
    queryFn: () => attendanceApi.list(moduleId!),
    enabled: !!moduleId,
  });
}

export function useAttendanceDay(
  moduleId: string | undefined,
  date: string | undefined,
) {
  return useQuery({
    queryKey: [...ATTENDANCE_KEY, "day", moduleId ?? "", date ?? ""],
    queryFn: () => attendanceApi.getDay(moduleId!, date!),
    enabled: !!moduleId && !!date,
  });
}

export function useSaveAttendance(moduleId: string, date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AttendanceSavePayload) =>
      attendanceApi.save(moduleId, date, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...ATTENDANCE_KEY, "day", moduleId, date] });
      qc.invalidateQueries({ queryKey: [...ATTENDANCE_KEY, "list", moduleId] });
      // Faltas afetam a tela de notas
      qc.invalidateQueries({ queryKey: ["grades", moduleId] });
      toast.success("Chamada salva.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteAttendance(moduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => attendanceApi.remove(moduleId, date),
    onSuccess: (_data, date) => {
      qc.invalidateQueries({ queryKey: [...ATTENDANCE_KEY, "day", moduleId, date] });
      qc.invalidateQueries({ queryKey: [...ATTENDANCE_KEY, "list", moduleId] });
      qc.invalidateQueries({ queryKey: ["grades", moduleId] });
      toast.success("Chamada removida.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
