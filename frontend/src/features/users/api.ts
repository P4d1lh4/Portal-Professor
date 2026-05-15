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

export const usersApi = {
  list: () => api.get<Profile[]>("/api/users").then((r) => r.data),

  create: (body: UserCreatePayload) =>
    api.post<Profile>("/api/users", body).then((r) => r.data),

  update: (id: string, body: UserUpdatePayload) =>
    api.put<Profile>(`/api/users/${id}`, body).then((r) => r.data),

  deactivate: (id: string) => api.delete(`/api/users/${id}`),

  reactivate: (id: string) =>
    api.post<Profile>(`/api/users/${id}/reactivate`).then((r) => r.data),
};
