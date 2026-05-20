import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { auditApi, type AuditLogParams } from "./api";

export const AUDIT_KEY = ["audit-log"] as const;

export function useAuditLog(params: AuditLogParams) {
  return useQuery({
    queryKey: [...AUDIT_KEY, params],
    queryFn: () => auditApi.list(params),
    placeholderData: keepPreviousData,
  });
}
