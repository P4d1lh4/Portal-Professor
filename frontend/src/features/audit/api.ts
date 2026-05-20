import api from "@/lib/axios";
import type { UserRole } from "@/types";

export type AuditAction = "insert" | "update" | "delete";

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: UserRole;
  action: AuditAction;
  entity: string;
  entity_id: string;
  summary: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditLogParams {
  entity?: string;
  actor_id?: string;
  limit?: number;
  offset?: number;
}

export const auditApi = {
  list: (params: AuditLogParams = {}) =>
    api
      .get<AuditLogPage>("/api/audit-log", { params })
      .then((r) => r.data),
};
