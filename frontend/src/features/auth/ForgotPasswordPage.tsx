import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CircleCheck, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LABEL = "text-[12.5px] font-semibold text-muted-foreground";

const schema = z.object({
  email: z
    .string()
    .min(1, "E-mail é obrigatório")
    .email("Informe um e-mail válido"),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo,
    });
    // Por segurança não revelamos se o email existe: tratamos qualquer
    // erro (exceto rate limit) como sucesso silencioso.
    if (error && error.status === 429) {
      toast.error(
        "Muitas solicitações. Aguarde alguns minutos antes de tentar novamente.",
      );
      return;
    }
    setSentTo(data.email);
    setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-8">
      <div className="w-full max-w-[520px] rounded-[14px] border bg-card p-7">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-primary text-primary-foreground">
            <KeyRound className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-[19px]">Recuperar senha</h1>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {sent
                ? "Verifique sua caixa de entrada."
                : "Enviaremos um link de redefinição para o seu e-mail."}
            </p>
          </div>
        </div>

        {sent ? (
          <div className="space-y-[22px]">
            <div className="flex items-start gap-[11px] rounded-[10px] border bg-accent/50 px-3.5 py-3">
              <CircleCheck className="mt-0.5 h-[15px] w-[15px] shrink-0 text-success" aria-hidden="true" />
              <div className="text-[12.5px]">
                <p>
                  Se houver uma conta vinculada a{" "}
                  <strong className="break-all font-semibold">{sentTo}</strong>, você
                  receberá um e-mail em alguns minutos.
                </p>
                <p className="mt-1 text-muted-foreground">
                  Não esqueça de verificar a pasta de spam.
                </p>
              </div>
            </div>
            <Button asChild variant="outline" className="h-11 w-full text-[13.5px] font-semibold">
              <Link to="/login">Voltar para o login</Link>
            </Button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-[22px]"
          >
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

            {/* No celular o envio fica em cima, largura toda. */}
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row">
              <Button asChild variant="outline" className="h-11 px-4 text-[13.5px] font-semibold">
                <Link to="/login">Voltar</Link>
              </Button>
              <Button
                type="submit"
                className="h-11 font-semibold sm:flex-1"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Enviando…
                  </>
                ) : (
                  "Enviar link de redefinição"
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
