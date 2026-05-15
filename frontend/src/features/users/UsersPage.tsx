import { useMemo, useState } from "react";
import {
  AlertCircle,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  UserX,
  Users as UsersIcon,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import type { Profile, UserRole } from "@/types";

import { UserDialog } from "./UserDialog";
import {
  useCreateUser,
  useDeactivateUser,
  useReactivateUser,
  useUpdateUser,
  useUsers,
} from "./useUsers";

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrador",
  coordinator: "Coordenador",
  professor: "Professor",
};

const ROLE_VARIANT: Record<
  UserRole,
  "default" | "secondary" | "outline"
> = {
  admin: "default",
  coordinator: "secondary",
  professor: "outline",
};

type RoleFilter = "all" | UserRole;
type StatusFilter = "all" | "active" | "inactive";

export default function UsersPage() {
  const { profile } = useAuth();
  const { data: users = [], isLoading, isError, error } = useUsers();
  const create = useCreateUser();
  const update = useUpdateUser();
  const deactivate = useDeactivateUser();
  const reactivate = useReactivateUser();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | undefined>();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter === "active" && !u.is_active) return false;
      if (statusFilter === "inactive" && u.is_active) return false;
      if (!term) return true;
      return (
        u.full_name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.username.toLowerCase().includes(term)
      );
    });
  }, [users, search, roleFilter, statusFilter]);

  const openCreate = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  const openEdit = (user: Profile) => {
    setEditing(user);
    setDialogOpen(true);
  };

  const handleDeactivate = (user: Profile) => {
    if (user.id === profile?.id) return; // backend já bloqueia, mas evita UI confusa
    if (
      !confirm(
        `Desativar "${user.full_name}"? Ele(a) não conseguirá mais entrar no sistema. Os dados permanecem.`
      )
    )
      return;
    deactivate.mutate(user.id);
  };

  const handleReactivate = (user: Profile) => {
    if (
      !confirm(
        `Reativar "${user.full_name}"? Ele(a) volta a conseguir entrar no sistema.`
      )
    )
      return;
    reactivate.mutate(user.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários"
        description="Gerencie administradores, coordenadores e professores."
        actions={
          <Button onClick={openCreate}>
            <Plus />
            Novo usuário
          </Button>
        }
      />

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, e-mail ou usuário…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Buscar usuários"
          />
        </div>
        <Select
          value={roleFilter}
          onValueChange={(v) => setRoleFilter(v as RoleFilter)}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os papéis</SelectItem>
            <SelectItem value="admin">Administradores</SelectItem>
            <SelectItem value="coordinator">Coordenadores</SelectItem>
            <SelectItem value="professor">Professores</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Erro ao carregar usuários"
          description={
            (error as Error)?.message ??
            "Verifique sua conexão e tente novamente."
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={
            search || roleFilter !== "all" || statusFilter !== "active"
              ? "Nenhum usuário encontrado"
              : "Nenhum usuário cadastrado"
          }
          description={
            search || roleFilter !== "all" || statusFilter !== "active"
              ? "Ajuste os filtros ou tente outra busca."
              : "Adicione o primeiro usuário clicando em Novo usuário."
          }
          actionLabel={
            !search && roleFilter === "all" && statusFilter === "active"
              ? "Novo usuário"
              : undefined
          }
          onAction={
            !search && roleFilter === "all" && statusFilter === "active"
              ? openCreate
              : undefined
          }
        />
      ) : (
        <>
          {/* Tabela — desktop */}
          <div className="hidden md:block rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead className="w-36">Usuário</TableHead>
                  <TableHead className="w-32">Papel</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const isSelf = u.id === profile?.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.full_name}
                        {isSelf && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (você)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.email}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        @{u.username}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ROLE_VARIANT[u.role]}>
                          {ROLE_LABEL[u.role]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.is_active ? (
                          <Badge variant="success">Ativo</Badge>
                        ) : (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(u)}
                            aria-label={`Editar ${u.full_name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {u.is_active ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              disabled={isSelf}
                              onClick={() => handleDeactivate(u)}
                              aria-label={`Desativar ${u.full_name}`}
                              title={
                                isSelf
                                  ? "Você não pode desativar a si mesmo"
                                  : "Desativar usuário"
                              }
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive disabled:text-muted-foreground"
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => handleReactivate(u)}
                              aria-label={`Reativar ${u.full_name}`}
                              title="Reativar usuário"
                              className="text-success hover:bg-success/10"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Cards — mobile */}
          <div className="grid gap-3 md:hidden">
            {filtered.map((u) => {
              const isSelf = u.id === profile?.id;
              return (
                <div
                  key={u.id}
                  className="rounded-xl border bg-card p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">
                        {u.full_name}
                        {isSelf && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (você)
                          </span>
                        )}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        @{u.username}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {u.email}
                      </p>
                    </div>
                    <Badge variant={u.is_active ? "success" : "secondary"}>
                      {u.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge variant={ROLE_VARIANT[u.role]}>
                      {ROLE_LABEL[u.role]}
                    </Badge>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(u)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                      {u.is_active ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={isSelf}
                          onClick={() => handleDeactivate(u)}
                          className="text-destructive disabled:text-muted-foreground"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          Desativar
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleReactivate(u)}
                          className="text-success"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reativar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            {filtered.length} usuário{filtered.length !== 1 ? "s" : ""}{" "}
            {search || roleFilter !== "all" || statusFilter !== "active"
              ? "encontrado"
              : "ativo"}
            {filtered.length !== 1 ? "s" : ""}
          </p>
        </>
      )}

      <UserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={editing}
        onCreate={async (data) => {
          await create.mutateAsync(data);
        }}
        onEdit={async (data) => {
          if (!editing) return;
          await update.mutateAsync({ id: editing.id, body: data });
        }}
      />
    </div>
  );
}
