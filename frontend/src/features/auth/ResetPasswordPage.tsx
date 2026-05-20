import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { useAuth, useAuthStore } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/60 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="font-display text-3xl font-medium tracking-tight">
            Aplicação Professor
          </h1>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Definir nova senha</CardTitle>
            <CardDescription>
              {noSession
                ? "Link inválido ou expirado."
                : "Escolha uma nova senha para acessar sua conta."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : noSession ? (
              <div className="space-y-4">
                <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  O link de recuperação expirou ou já foi utilizado. Solicite
                  um novo e-mail para redefinir a senha.
                </p>
                <Button asChild className="w-full">
                  <Link to="/forgot-password">Solicitar novo link</Link>
                </Button>
                <Button asChild variant="ghost" className="w-full">
                  <Link to="/login">
                    <ArrowLeft className="h-4 w-4" />
                    Voltar para o login
                  </Link>
                </Button>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit(onSubmit)}
                noValidate
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="password">Nova senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Mínimo 8 caracteres"
                      className="pr-10"
                      {...register("password")}
                      aria-describedby={
                        errors.password ? "password-error" : undefined
                      }
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
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
                  <Label htmlFor="confirm">Confirmar senha</Label>
                  <Input
                    id="confirm"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Repita a senha"
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

                <Button
                  type="submit"
                  className="w-full"
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
