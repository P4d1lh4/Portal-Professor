import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CircleCheck, Eye, EyeOff, Loader2, Ticket } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usersApi, type InviteRole } from "@/features/users/api";
import { accountFields } from "@/features/users/schemas";

const ROLE_LABELS: Record<InviteRole, string> = {
  coordinator: "Coordenador(a)",
  professor: "Professor(a)",
};

const LABEL = "text-[12.5px] font-semibold text-muted-foreground";

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
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-8">
      <div className="w-full max-w-[520px] rounded-[14px] border bg-card p-7">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-primary text-primary-foreground">
            <Ticket className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-[19px]">Criar conta com convite</h1>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              O convite é de uso único e vale por 7 dias.
            </p>
          </div>
        </div>

        {invite ? (
          <>
            <div className="mb-5 flex items-center gap-[11px] rounded-[10px] border bg-accent/50 px-3.5 py-3">
              <CircleCheck className="h-[15px] w-[15px] shrink-0 text-success" aria-hidden="true" />
              <p className="text-[12.5px]">
                Convite válido para{" "}
                <strong className="font-semibold">{ROLE_LABELS[invite.role]}</strong>.
              </p>
            </div>
            <AccountStep code={invite.code} onOtherCode={() => setInvite(null)} />
          </>
        ) : (
          <CodeStep onValid={setInvite} />
        )}
      </div>
    </div>
  );
}

function BackToLogin() {
  return (
    <Button asChild variant="outline" className="h-11 px-4 text-[13.5px] font-semibold">
      <Link to="/login">Voltar</Link>
    </Button>
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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-[22px]">
      <div className="space-y-1.5">
        <Label htmlFor="code" className={LABEL}>Código do convite</Label>
        <Input
          id="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX"
          className="h-11 font-mono uppercase tracking-widest"
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

      <div className="flex gap-2.5">
        <BackToLogin />
        <Button type="submit" className="h-11 flex-1 font-semibold" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Conferindo…
            </>
          ) : (
            "Continuar"
          )}
        </Button>
      </div>
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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-[22px]">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        <div className="space-y-1.5">
          <Label htmlFor="signup-full_name" className={LABEL}>Nome completo</Label>
          <Input
            id="signup-full_name"
            autoComplete="name"
            placeholder="Ex.: Maria Souza"
            className="h-11"
            {...register("full_name")}
            {...field("full_name")}
          />
          {error("full_name")}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signup-username" className={LABEL}>Usuário</Label>
          <Input
            id="signup-username"
            autoComplete="username"
            placeholder="ex: maria.souza"
            className="h-11 font-mono"
            {...register("username")}
            {...field("username")}
          />
          {error("username")}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signup-email" className={LABEL}>E-mail institucional</Label>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            placeholder="voce@escola.com"
            className="h-11"
            {...register("email")}
            {...field("email")}
          />
          {error("email")}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signup-password" className={LABEL}>Senha</Label>
          <div className="relative">
            <Input
              id="signup-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              className="h-11 pr-11"
              {...register("password")}
              {...field("password")}
            />
            <button
              type="button"
              className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {error("password")}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signup-confirm" className={LABEL}>Confirmar senha</Label>
          <Input
            id="signup-confirm"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Repita a senha"
            className="h-11"
            {...register("confirm")}
            {...field("confirm")}
          />
          {error("confirm")}
        </div>
      </div>

      <div className="flex gap-2.5">
        <BackToLogin />
        <Button type="submit" className="h-11 flex-1 font-semibold" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Criando conta…
            </>
          ) : (
            "Criar conta e entrar"
          )}
        </Button>
      </div>

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
