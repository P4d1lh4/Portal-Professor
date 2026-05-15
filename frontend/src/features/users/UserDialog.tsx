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

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  coordinator: "Coordenador(a)",
  professor: "Professor(a)",
};

const ROLES: UserRole[] = ["admin", "coordinator", "professor"];

const createSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z
    .string()
    .min(8, "Senha deve ter ao menos 8 caracteres")
    .max(72, "Senha muito longa"),
  username: z
    .string()
    .min(2, "Mínimo 2 caracteres")
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, "Use apenas letras, números, ponto, underscore ou hífen"),
  full_name: z.string().min(2, "Nome completo é obrigatório").max(120),
  role: z.enum(["admin", "coordinator", "professor"]),
});

const editSchema = z.object({
  username: z
    .string()
    .min(2, "Mínimo 2 caracteres")
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, "Use apenas letras, números, ponto, underscore ou hífen"),
  full_name: z.string().min(2, "Nome completo é obrigatório").max(120),
  role: z.enum(["admin", "coordinator", "professor"]),
});

export type UserDialogCreateData = z.infer<typeof createSchema>;
export type UserDialogEditData = z.infer<typeof editSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: Profile;
  onCreate: (data: UserDialogCreateData) => Promise<void>;
  onEdit: (data: UserDialogEditData) => Promise<void>;
}

export function UserDialog({
  open,
  onOpenChange,
  user,
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
              />
              {editForm.formState.errors.full_name && (
                <p className="text-xs text-destructive">
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
              />
              {editForm.formState.errors.username && (
                <p className="text-xs text-destructive">
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

            <p className="text-xs text-muted-foreground">
              O e-mail não pode ser alterado por aqui. Para resetar a senha,
              use o painel do Supabase.
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
              />
              {createForm.formState.errors.full_name && (
                <p className="text-xs text-destructive">
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
                />
                {createForm.formState.errors.username && (
                  <p className="text-xs text-destructive">
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
              />
              {createForm.formState.errors.email && (
                <p className="text-xs text-destructive">
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
                <p className="text-xs text-destructive">
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
