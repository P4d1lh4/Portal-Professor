import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Eye, EyeOff, GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
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
import { usersApi, type InviteRole } from "@/features/users/api";
import { accountFields } from "@/features/users/schemas";

const ROLE_LABELS: Record<InviteRole, string> = {
  coordinator: "Coordenador(a)",
  professor: "Professor(a)",
};

const codeSchema = z.object({
  code: z.string().trim().min(1, "Informe o código do convite"),
});

const accountSchema = z
  .object({ ...accountFields, confirm: z.string() })
  .refine((data) => data.password === data.confirm, {
    path: ["confirm"],
    message: "As senhas não coincidem.",
  });

type CodeForm = z.infer<typeof codeSchema>;
type AccountForm = z.infer<typeof accountSchema>;

interface Invite {
  code: string;
  role: InviteRole;
}

// Cadastro por convite (registro 69): o código é conferido antes do formulário,
// e o papel da conta vem do convite, nunca daqui.
export default function SignupPage() {
  const [invite, setInvite] = useState<Invite | null>(null);

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
            <CardTitle className="text-xl">Criar conta</CardTitle>
            <CardDescription>
              {invite
                ? `Convite para ${ROLE_LABELS[invite.role]}. Preencha seus dados.`
                : "Digite o código de convite que você recebeu."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {invite ? (
              <AccountStep code={invite.code} onOtherCode={() => setInvite(null)} />
            ) : (
              <CodeStep onValid={setInvite} />
            )}

            <Button asChild variant="ghost" className="w-full">
              <Link to="/login">
                <ArrowLeft className="h-4 w-4" />
                Voltar para o login
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CodeStep({ onValid }: { onValid: (invite: Invite) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CodeForm>({ resolver: zodResolver(codeSchema) });

  const onSubmit = async ({ code }: CodeForm) => {
    try {
      const { role } = await usersApi.checkInvite(code);
      onValid({ code, role });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível conferir o código.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="code">Código do convite</Label>
        <Input
          id="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX"
          className="font-mono uppercase tracking-widest"
          {...register("code")}
          aria-invalid={!!errors.code}
          aria-describedby={errors.code ? "code-error" : undefined}
        />
        {errors.code && (
          <p id="code-error" className="text-xs text-destructive">
            {errors.code.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="animate-spin" />
            Conferindo…
          </>
        ) : (
          "Continuar"
        )}
      </Button>
    </form>
  );
}

function AccountStep({ code, onOtherCode }: { code: string; onOtherCode: () => void }) {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AccountForm>({ resolver: zodResolver(accountSchema) });

  const onSubmit = async (data: AccountForm) => {
    try {
      await usersApi.signup({
        code,
        full_name: data.full_name,
        username: data.username,
        email: data.email,
        password: data.password,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar a conta.");
      return;
    }
    try {
      await signIn(data.email, data.password);
      toast.success("Conta criada.");
      navigate("/dashboard", { replace: true });
    } catch {
      toast.success("Conta criada. Entre com seu e-mail e senha.");
      navigate("/login", { replace: true });
    }
  };

  const field = (id: keyof AccountForm) => ({
    "aria-invalid": !!errors[id],
    "aria-describedby": errors[id] ? `signup-${id}-error` : undefined,
  });

  const error = (id: keyof AccountForm) =>
    errors[id] && (
      <p id={`signup-${id}-error`} className="text-xs text-destructive">
        {errors[id]?.message}
      </p>
    );

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="signup-full_name">Nome completo</Label>
        <Input
          id="signup-full_name"
          autoComplete="name"
          placeholder="Ex.: Maria Souza"
          {...register("full_name")}
          {...field("full_name")}
        />
        {error("full_name")}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="signup-username">Usuário</Label>
        <Input
          id="signup-username"
          autoComplete="username"
          placeholder="ex: maria.souza"
          className="font-mono"
          {...register("username")}
          {...field("username")}
        />
        {error("username")}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="signup-email">E-mail</Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          placeholder="voce@escola.com"
          {...register("email")}
          {...field("email")}
        />
        {error("email")}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="signup-password">Senha</Label>
        <div className="relative">
          <Input
            id="signup-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            className="pr-10"
            {...register("password")}
            {...field("password")}
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {error("password")}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="signup-confirm">Confirmar senha</Label>
        <Input
          id="signup-confirm"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Repita a senha"
          {...register("confirm")}
          {...field("confirm")}
        />
        {error("confirm")}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="animate-spin" />
            Criando conta…
          </>
        ) : (
          "Criar conta"
        )}
      </Button>

      <button
        type="button"
        onClick={onOtherCode}
        className="block w-full text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Usar outro código
      </button>
    </form>
  );
}
