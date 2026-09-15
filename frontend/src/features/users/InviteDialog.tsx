import { useState, type ReactNode } from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";

import type { InviteRole } from "./api";
import { useCreateInvite } from "./useUsers";

const ROLE_LABELS: Record<InviteRole, string> = {
  professor: "Professor(a)",
  coordinator: "Coordenador(a)",
};

/**
 * Gera um código de convite de uso único (registro 69); o filho é o botão que
 * abre o diálogo. O admin escolhe o papel; o coordenador só convida professor.
 */
export function InviteDialog({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const roles: InviteRole[] =
    profile?.role === "admin" ? ["professor", "coordinator"] : ["professor"];
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<InviteRole>("professor");
  const create = useCreateInvite();
  const invite = create.data;

  const onOpenChange = (next: boolean) => {
    // Zera ao abrir, não ao fechar: fechando, o código daria lugar ao
    // formulário durante a animação de saída. Quem perdeu o código gera outro.
    if (next) {
      create.reset();
      setRole("professor");
    }
    setOpen(next);
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Código copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o código e copie.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convite para criar conta</DialogTitle>
          <DialogDescription>
            A pessoa usa o código em “Criar conta”, na tela de login, e cadastra
            os próprios dados e a senha.
          </DialogDescription>
        </DialogHeader>

        {invite ? (
          <div className="space-y-2">
            <p className="text-sm">
              Código para <span className="font-medium">{ROLE_LABELS[invite.role]}</span>:
            </p>
            <div className="flex gap-2">
              <code className="flex-1 select-all rounded-lg border bg-muted px-3 py-2 text-center font-mono text-lg tracking-widest">
                {invite.code}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-auto"
                onClick={() => copy(invite.code)}
                aria-label="Copiar código"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Uso único, vale até{" "}
              {new Date(invite.expires_at).toLocaleDateString("pt-BR")}. Copie
              agora: o código não aparece de novo.
            </p>
          </div>
        ) : roles.length > 1 ? (
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Papel da conta</Label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as InviteRole)}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-sm">
            Convite para <span className="font-medium">{ROLE_LABELS.professor}</span>.
          </p>
        )}

        <DialogFooter>
          {invite ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Pronto
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => create.mutate(role)}
                disabled={create.isPending}
              >
                {create.isPending && <Loader2 className="animate-spin" />}
                Gerar código
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
