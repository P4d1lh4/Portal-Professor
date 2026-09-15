import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import {
  usersApi,
  type InviteRole,
  type ListUsersParams,
  type UserCreatePayload,
  type UserUpdatePayload,
} from "./api";

export const USERS_KEY = ["users"] as const;

export function useUsers(params: ListUsersParams = {}) {
  return useQuery({
    queryKey: [...USERS_KEY, params],
    queryFn: () => usersApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserCreatePayload) => usersApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_KEY });
      toast.success("Usuário criado com sucesso.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UserUpdatePayload }) =>
      usersApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_KEY });
      toast.success("Usuário atualizado.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.deactivate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_KEY });
      toast.success("Usuário desativado.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useReactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.reactivate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_KEY });
      toast.success("Usuário reativado.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, new_password }: { id: string; new_password: string }) =>
      usersApi.resetPassword(id, new_password),
    onSuccess: () => toast.success("Senha redefinida."),
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCreateInvite() {
  return useMutation({
    mutationFn: (role: InviteRole) => usersApi.createInvite(role),
    onError: (err: Error) => toast.error(err.message),
  });
}
