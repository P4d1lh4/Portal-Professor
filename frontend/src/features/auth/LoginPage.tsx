import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "E-mail é obrigatório")
    .email("Informe um e-mail válido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

type LoginForm = z.infer<typeof loginSchema>;

const LABEL = "text-[12.5px] font-semibold text-muted-foreground";

function Brand() {
  return (
    <div className="flex items-center gap-[11px]">
      <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
        <GraduationCap className="h-[17px] w-[17px]" />
      </span>
      <span className="text-sm font-semibold">Aplicação Professor</span>
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      await signIn(data.email, data.password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao fazer login.");
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Painel da marca — some no celular */}
      <aside className="hidden min-w-[280px] flex-1 flex-col justify-between bg-rail p-11 text-white md:flex">
        <Brand />
        <div>
          <p className="max-w-[380px] text-[26px] font-semibold leading-tight tracking-tight">
            Notas, faltas e chamada no mesmo lugar — por período e por módulo.
          </p>
          <p className="mt-3.5 max-w-[360px] text-[13.5px] text-white/60">
            Acesso para administração, coordenação e professores, com registro
            de auditoria de cada alteração.
          </p>
        </div>
        <p className="font-mono text-[11px] text-white/60">
          uso interno da instituição
        </p>
      </aside>

      <main className="flex w-full flex-none items-center justify-center bg-card px-7 py-8 md:max-w-[520px]">
        <div className="w-full max-w-[352px]">
          <div className="mb-10 md:hidden">
            <Brand />
          </div>

          <h1 className="text-2xl">Entrar</h1>
          <p className="mb-[26px] mt-[7px] text-[13.5px] text-muted-foreground">
            Use seu e-mail institucional.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className={LABEL}>E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="voce@escola.com"
                className="h-11"
                {...register("email")}
                aria-describedby={errors.email ? "email-error" : undefined}
              />
              {errors.email && (
                <p id="email-error" className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className={LABEL}>Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
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
                  aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
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

            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-[12.5px] font-semibold underline-offset-4 hover:underline"
              >
                Esqueci minha senha
              </Link>
            </div>

            <Button
              type="submit"
              className="h-[46px] w-full text-[14.5px] font-semibold"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  Entrando…
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>

          <div className="mt-[22px] flex items-center justify-between gap-2.5 border-t pt-5">
            <p className="text-[12.5px] text-muted-foreground">
              Recebeu um convite?
            </p>
            <Button
              asChild
              variant="outline"
              className="h-[38px] px-3.5 text-[13px] font-semibold"
            >
              <Link to="/signup">Criar conta</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
