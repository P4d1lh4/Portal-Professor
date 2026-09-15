import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Profile, UserRole } from "@/types";

import { accountFields } from "./schemas";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  coordinator: "Coordenador(a)",
  professor: "Professor(a)",
};

const ROLES: UserRole[] = ["admin", "coordinator", "professor"];

const createSchema = z.object({
  ...accountFields,
  role: z.enum(["admin", "coordinator", "professor"]),
});

const editSchema = z.object({
  username: accountFields.username,
  full_name: accountFields.full_name,
  role: z.enum(["admin", "coordinator", "professor"]),
  // B-S5: vazio mantém a senha atual.
  new_password: z
    .string()
    .max(72, "Senha muito longa")
    .refine((v) => v === "" || v.length >= 8, {
      message: "Senha deve ter ao menos 8 caracteres",
    }),
});

export type UserDialogCreateData = z.infer<typeof createSchema>;
export type UserDialogEditData = z.infer<typeof editSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: Profile;
  /** B-S5: "Nova senha" na edição; falso quando o admin edita a si mesmo. */
  canResetPassword?: boolean;
  onCreate: (data: UserDialogCreateData) => Promise<void>;
  onEdit: (data: UserDialogEditData) => Promise<void>;
}

export function UserDialog({
  open,
  onOpenChange,
  user,
  canResetPassword = false,
  onCreate,
  onEdit,
}: Props) {
  const isEdit = !!user;
  const [showPassword, setShowPassword] = useState(false);

  // Hooks separados para evitar mistura de schemas — RHF não suporta troca
  // dinâmica de resolver de forma limpa.
  const createForm = useForm<UserDialogCreateData>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: "professor" },
  });

  const editForm = useForm<UserDialogEditData>({
    resolver: zodResolver(editSchema),
  });

  useEffect(() => {
    if (!open) return;
    setShowPassword(false);
    if (user) {
      editForm.reset({
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        new_password: "",
      });
    } else {
      createForm.reset({
        email: "",
        password: "",
        username: "",
        full_name: "",
        role: "professor",
      });
    }
  }, [open, user, createForm, editForm]);

  const handleCreate = async (data: UserDialogCreateData) => {
    await onCreate(data);
    onOpenChange(false);
  };

  const handleEdit = async (data: UserDialogEditData) => {
    await onEdit(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar usuário" : "Novo usuário"}</DialogTitle>
        </DialogHeader>

        {isEdit ? (
          <form
            onSubmit={editForm.handleSubmit(handleEdit)}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="edit-fullname">Nome completo *</Label>
              <Input
                id="edit-fullname"
                placeholder="Ex.: Maria Souza"
                {...editForm.register("full_name")}
                aria-invalid={!!editForm.formState.errors.full_name}
                aria-describedby={
                  editForm.formState.errors.full_name ? "edit-fullname-error" : undefined
                }
              />
              {editForm.formState.errors.full_name && (
                <p id="edit-fullname-error" className="text-xs text-destructive">
                  {editForm.formState.errors.full_name.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-username">Usuário (login) *</Label>
              <Input
                id="edit-username"
                className="font-mono"
                {...editForm.register("username")}
                aria-invalid={!!editForm.formState.errors.username}
                aria-describedby={
                  editForm.formState.errors.username ? "edit-username-error" : undefined
                }
              />
              {editForm.formState.errors.username && (
                <p id="edit-username-error" className="text-xs text-destructive">
                  {editForm.formState.errors.username.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-role">Papel *</Label>
              <Select
                value={editForm.watch("role")}
                onValueChange={(v) =>
                  editForm.setValue("role", v as UserRole, {
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger id="edit-role">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {canResetPassword && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-password">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="edit-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Em branco mantém a senha atual"
                    className="pr-10"
                    {...editForm.register("new_password")}
                    aria-invalid={!!editForm.formState.errors.new_password}
                    aria-describedby={
                      editForm.formState.errors.new_password ? "edit-password-error" : undefined
                    }
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {editForm.formState.errors.new_password && (
                  <p id="edit-password-error" className="text-xs text-destructive">
                    {editForm.formState.errors.new_password.message}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Compartilhe a nova senha com o usuário em um canal seguro.
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              O e-mail não pode ser alterado por aqui.
            </p>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={editForm.formState.isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={editForm.formState.isSubmitting}
              >
                {editForm.formState.isSubmitting && (
                  <Loader2 className="animate-spin" />
                )}
                Salvar alterações
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form
            onSubmit={createForm.handleSubmit(handleCreate)}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-fullname">Nome completo *</Label>
              <Input
                id="new-fullname"
                placeholder="Ex.: Maria Souza"
                autoFocus
                {...createForm.register("full_name")}
                aria-invalid={!!createForm.formState.errors.full_name}
                aria-describedby={
                  createForm.formState.errors.full_name ? "new-fullname-error" : undefined
                }
              />
              {createForm.formState.errors.full_name && (
                <p id="new-fullname-error" className="text-xs text-destructive">
                  {createForm.formState.errors.full_name.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-username">Usuário (login) *</Label>
                <Input
                  id="new-username"
                  placeholder="ex: maria.souza"
                  className="font-mono"
                  {...createForm.register("username")}
                  aria-invalid={!!createForm.formState.errors.username}
                  aria-describedby={
                    createForm.formState.errors.username ? "new-username-error" : undefined
                  }
                />
                {createForm.formState.errors.username && (
                  <p id="new-username-error" className="text-xs text-destructive">
                    {createForm.formState.errors.username.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-role">Papel *</Label>
                <Select
                  value={createForm.watch("role")}
                  onValueChange={(v) =>
                    createForm.setValue("role", v as UserRole, {
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger id="new-role">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-email">E-mail *</Label>
              <Input
                id="new-email"
                type="email"
                placeholder="maria@escola.com"
                {...createForm.register("email")}
                aria-invalid={!!createForm.formState.errors.email}
                aria-describedby={
                  createForm.formState.errors.email ? "new-email-error" : undefined
                }
              />
              {createForm.formState.errors.email && (
                <p id="new-email-error" className="text-xs text-destructive">
                  {createForm.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-password">Senha inicial *</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Mínimo 8 caracteres"
                  className="pr-10"
                  {...createForm.register("password")}
                  aria-invalid={!!createForm.formState.errors.password}
                  aria-describedby={
                    createForm.formState.errors.password ? "new-password-error" : undefined
                  }
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? "Ocultar senha" : "Exibir senha"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {createForm.formState.errors.password && (
                <p id="new-password-error" className="text-xs text-destructive">
                  {createForm.formState.errors.password.message}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Compartilhe esta senha com o usuário em um canal seguro. Ele
                poderá alterá-la depois.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={createForm.formState.isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createForm.formState.isSubmitting}
              >
                {createForm.formState.isSubmitting && (
                  <Loader2 className="animate-spin" />
                )}
                Criar usuário
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
