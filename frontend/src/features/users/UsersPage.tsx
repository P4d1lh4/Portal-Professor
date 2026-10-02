import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Ticket,
  UserX,
  Users as UsersIcon,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/Pagination";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { FilterChips, type FilterChipOption } from "@/components/shared/FilterChips";
import { InitialsAvatar } from "@/components/shared/InitialsAvatar";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import type { Profile, UserRole } from "@/types";

import { InviteDialog } from "./InviteDialog";
import { UserDialog } from "./UserDialog";
import {
  useCreateUser,
  useDeactivateUser,
  useReactivateUser,
  useResetUserPassword,
  useUpdateUser,
  useUsers,
} from "./useUsers";
import type { ListUsersParams } from "./api";

const PAGE_SIZE = 25;

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrador",
  coordinator: "Coordenador",
  professor: "Professor",
};

// Administrador em destaque; os demais papéis em tom neutro.
const ROLE_PILL: Record<UserRole, string> = {
  admin: "text-foreground",
  coordinator: "",
  professor: "bg-transparent",
};

// ponytail: escolha única, como no desenho — some a combinação papel + inativos
// e o filtro só de administradores; volta a dois grupos de chips se fizer falta.
type UserFilter = "all" | "coordinator" | "professor" | "inactive";

const FILTERS: FilterChipOption<UserFilter>[] = [
  { value: "all", label: "Todos os papéis" },
  { value: "coordinator", label: "Coordenação" },
  { value: "professor", label: "Professores" },
  { value: "inactive", label: "Inativos" },
];

const COLUMNS = [
  ["Pessoa", ""],
  ["Papel", "w-[150px]"],
  ["Situação", "w-[110px]"],
  ["Ações", "w-[120px] text-right"],
] as const;

export default function UsersPage() {
  const { profile } = useAuth();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const [page, setPage] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | undefined>();

  const debouncedSearch = useDebouncedValue(search, 300);

  // Volta para a primeira página quando os filtros mudam
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, filter]);

  const queryParams = useMemo<ListUsersParams>(() => {
    const params: ListUsersParams = {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      // Fora do chip "Inativos", a lista mostra só quem está ativo (como antes).
      is_active: filter !== "inactive",
    };
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (filter === "coordinator" || filter === "professor") params.role = filter;
    return params;
  }, [debouncedSearch, filter, page]);

  const { data, isLoading, isError, error, isPlaceholderData } =
    useUsers(queryParams);
  const create = useCreateUser();
  const update = useUpdateUser();
  const deactivate = useDeactivateUser();
  const reactivate = useReactivateUser();
  const resetPassword = useResetUserPassword();

  const users = data?.items ?? [];
  const total = data?.total ?? 0;
  const filtered = !!search || filter !== "all";

  const openCreate = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  const openEdit = (user: Profile) => {
    setEditing(user);
    setDialogOpen(true);
  };

  const { confirm, confirmDialog } = useConfirm();

  const handleDeactivate = async (user: Profile) => {
    if (user.id === profile?.id) return; // backend já bloqueia, mas evita UI confusa
    const ok = await confirm({
      title: `Desativar "${user.full_name}"?`,
      description:
        "Ele(a) não conseguirá mais entrar no sistema. Os dados permanecem.",
      confirmLabel: "Desativar",
      destructive: true,
    });
    if (!ok) return;
    deactivate.mutate(user.id);
  };

  const handleReactivate = async (user: Profile) => {
    const ok = await confirm({
      title: `Reativar "${user.full_name}"?`,
      description: "Ele(a) volta a conseguir entrar no sistema.",
      confirmLabel: "Reativar",
    });
    if (!ok) return;
    reactivate.mutate(user.id);
  };

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Administração"
        title="Usuários e convites"
        actions={
          <>
            <InviteDialog>
              <Button variant="outline">
                <Ticket />
                Gerar convite
              </Button>
            </InviteDialog>
            <Button onClick={openCreate}>
              <Plus />
              Novo usuário
            </Button>
          </>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1 sm:max-w-[300px]">
          <Search className="absolute left-[11px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Nome, e-mail ou usuário"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-[10px] bg-card pl-[34px] text-[13.5px]"
            aria-label="Buscar usuários"
          />
        </div>
        <FilterChips
          label="Filtrar usuários"
          options={FILTERS}
          value={filter}
          onChange={setFilter}
        />
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
      ) : users.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={filtered ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
          description={
            filtered
              ? "Ajuste os filtros ou tente outra busca."
              : "Adicione o primeiro usuário clicando em Novo usuário."
          }
          actionLabel={filtered ? undefined : "Novo usuário"}
          onAction={filtered ? undefined : openCreate}
        />
      ) : (
        <>
          {/* Em telas estreitas a tabela rola na horizontal dentro do card */}
          <section className="overflow-hidden rounded-xl border bg-card">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {COLUMNS.map(([label, width]) => (
                    <TableHead
                      key={label}
                      className={cn(
                        "h-auto px-[18px] py-[11px] text-[11px] font-semibold uppercase",
                        width,
                      )}
                    >
                      {label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isSelf = u.id === profile?.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="px-[18px] py-2.5">
                        <div className="flex items-center gap-[11px]">
                          <InitialsAvatar
                            name={u.full_name}
                            className={u.role === "admin" ? "text-foreground" : undefined}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">
                              {u.full_name}
                              {isSelf && (
                                <span className="font-normal text-muted-foreground">
                                  {" "}(você)
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                              {u.email} ·{" "}
                              <span className="font-mono">@{u.username}</span>
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-[18px] py-2.5">
                        <Badge
                          variant="secondary"
                          className={cn("whitespace-nowrap text-[11.5px]", ROLE_PILL[u.role])}
                        >
                          {ROLE_LABEL[u.role]}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-[18px] py-2.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-[7px] text-[12.5px] font-semibold",
                            u.is_active ? "text-success" : "text-muted-foreground",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className="h-[7px] w-[7px] rounded-full bg-current"
                          />
                          {u.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </TableCell>
                      <TableCell className="px-[18px] py-2.5">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            onClick={() => openEdit(u)}
                            aria-label={`Editar ${u.full_name}`}
                            className="text-muted-foreground hover:bg-card hover:text-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {u.is_active ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
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
                              <UserX className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              onClick={() => handleReactivate(u)}
                              aria-label={`Reativar ${u.full_name}`}
                              title="Reativar usuário"
                              className="text-success hover:bg-success/10 hover:text-success"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {total} usuário{total !== 1 ? "s" : ""}{" "}
              {filtered ? `encontrado${total !== 1 ? "s" : ""}` : "no total"}
            </p>

            <Pagination
              page={page}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              disabled={isPlaceholderData}
            />
          </div>
        </>
      )}

      <UserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={editing}
        canResetPassword={!!editing && editing.id !== profile?.id}
        onCreate={async (data) => {
          await create.mutateAsync(data);
        }}
        onEdit={async ({ new_password, ...body }) => {
          if (!editing) return;
          await update.mutateAsync({ id: editing.id, body });
          if (new_password) {
            await resetPassword.mutateAsync({ id: editing.id, new_password });
          }
        }}
      />
      {confirmDialog}
    </div>
  );
}
