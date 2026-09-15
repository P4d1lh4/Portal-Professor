import api from "@/lib/axios";
import type { Profile, UserRole } from "@/types";

export interface UserCreatePayload {
  email: string;
  password: string;
  username: string;
  full_name: string;
  role: UserRole;
}

export interface UserUpdatePayload {
  username?: string;
  full_name?: string;
  role?: UserRole;
  is_active?: boolean;
}

export interface ListUsersParams {
  search?: string;
  role?: UserRole;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

export interface PaginatedUsers {
  items: Profile[];
  total: number;
  limit: number;
  offset: number;
}

// Convite de cadastro (registro 69): nunca para admin.
export type InviteRole = Exclude<UserRole, "admin">;

export interface InviteCreated {
  code: string;
  role: InviteRole;
  expires_at: string;
}

export type SignupPayload = Omit<UserCreatePayload, "role"> & { code: string };

export const usersApi = {
  list: (params: ListUsersParams = {}) =>
    api
      .get<PaginatedUsers>("/api/users", { params })
      .then((r) => r.data),

  create: (body: UserCreatePayload) =>
    api.post<Profile>("/api/users", body).then((r) => r.data),

  update: (id: string, body: UserUpdatePayload) =>
    api.put<Profile>(`/api/users/${id}`, body).then((r) => r.data),

  deactivate: (id: string) => api.delete(`/api/users/${id}`),

  reactivate: (id: string) =>
    api.post<Profile>(`/api/users/${id}/reactivate`).then((r) => r.data),

  resetPassword: (id: string, new_password: string) =>
    api.post(`/api/users/${id}/reset-password`, { new_password }),

  createInvite: (role: InviteRole) =>
    api.post<InviteCreated>("/api/invites", { role }).then((r) => r.data),

  // Públicas: quem se cadastra ainda não tem sessão.
  checkInvite: (code: string) =>
    api
      .post<{ role: InviteRole }>("/api/signup/check", { code })
      .then((r) => r.data),

  signup: (body: SignupPayload) =>
    api.post<Profile>("/api/signup", body).then((r) => r.data),
};
