import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, LockKeyhole, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { useAuth, useAuthStore } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LABEL = "text-[12.5px] font-semibold text-muted-foreground";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "A senha deve ter no mínimo 8 caracteres."),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    path: ["confirm"],
    message: "As senhas não coincidem.",
  });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { session, isLoading, signOut } = useAuth();
  const clearRecoveryFlag = useAuthStore((s) => s._setPasswordRecovery);

  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  // Se o usuário chega aqui sem sessão (link expirado/inválido), avisa.
  const noSession = !isLoading && !session;

  useEffect(() => {
    // Marca como "em recuperação" para que o ProtectedRoute não force
    // a saída da rota enquanto o usuário ainda não definiu a nova senha.
    clearRecoveryFlag(true);
    return () => {
      // Quando o componente desmonta (após salvar), libera o gate.
      clearRecoveryFlag(false);
    };
  }, [clearRecoveryFlag]);

  const onSubmit = async (data: FormValues) => {
    const { error } = await supabase.auth.updateUser({
      password: data.password,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Senha atualizada. Faça login novamente.");
    clearRecoveryFlag(false);
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-8">
      <div className="w-full max-w-[520px] rounded-[14px] border bg-card p-7">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-primary text-primary-foreground">
            <LockKeyhole className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-[19px]">Definir nova senha</h1>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {noSession
                ? "Link inválido ou expirado."
                : "Escolha uma nova senha para acessar sua conta."}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : noSession ? (
          <div className="space-y-[22px]">
            <p className="rounded-[10px] border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-[12.5px] text-destructive">
              O link de recuperação expirou ou já foi utilizado. Solicite
              um novo e-mail para redefinir a senha.
            </p>
            {/* No celular o botão principal fica em cima, largura toda. */}
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row">
              <Button asChild variant="outline" className="h-11 px-4 text-[13.5px] font-semibold">
                <Link to="/login">Voltar</Link>
              </Button>
              <Button asChild className="h-11 font-semibold sm:flex-1">
                <Link to="/forgot-password">Solicitar novo link</Link>
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-[22px]"
          >
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="password" className={LABEL}>Nova senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Mínimo 8 caracteres"
                    className="h-11 pr-11"
                    {...register("password")}
                    aria-describedby={
                      errors.password ? "password-error" : undefined
                    }
                  />
                  <button
                    type="button"
                    className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                {errors.password && (
                  <p id="password-error" className="text-xs text-destructive">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm" className={LABEL}>Confirmar senha</Label>
                <Input
                  id="confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Repita a senha"
                  className="h-11"
                  {...register("confirm")}
                  aria-describedby={
                    errors.confirm ? "confirm-error" : undefined
                  }
                />
                {errors.confirm && (
                  <p id="confirm-error" className="text-xs text-destructive">
                    {errors.confirm.message}
                  </p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              className="h-11 w-full font-semibold"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  Salvando…
                </>
              ) : (
                "Salvar nova senha"
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
