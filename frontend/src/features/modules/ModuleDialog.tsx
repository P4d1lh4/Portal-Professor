import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import api from "@/lib/axios";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleItem } from "./api";

const schema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  code: z.string().min(1, "Código é obrigatório"),
  professor_id: z.string().min(1, "Professor é obrigatório"),
  academic_period_id: z.string().min(1, "Período é obrigatório"),
  credits: z.coerce.number().int().min(1).max(20).default(4),
  max_absences: z.coerce.number().int().min(0).default(10),
  is_active: z.boolean().default(true),
});

type FormData = z.infer<typeof schema>;

interface ModuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module?: ModuleItem;
  onSubmit: (data: FormData) => Promise<void>;
}

export function ModuleDialog({
  open,
  onOpenChange,
  module: mod,
  onSubmit,
}: ModuleDialogProps) {
  const { profile } = useAuth();
  const isEdit = !!mod;
  const canChangeProfessor = profile?.role !== "professor";

  const {
    data: professors = [],
    isLoading: isLoadingProfessors,
    isError: isProfessorsError,
    error: professorsError,
    refetch: refetchProfessors,
  } = useQuery({
    queryKey: ["professors"],
    queryFn: () =>
      api
        .get<{ id: string; full_name: string }[]>("/api/professors")
        .then((r) => r.data),
    enabled: open && canChangeProfessor,
  });

  const {
    data: periods = [],
    isLoading: isLoadingPeriods,
    isError: isPeriodsError,
    error: periodsError,
    refetch: refetchPeriods,
  } = useQuery({
    queryKey: ["periods-active"],
    queryFn: () =>
      api
        .get<{ id: string; name: string }[]>("/api/periods/active")
        .then((r) => r.data),
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { credits: 4, max_absences: 10, is_active: true },
  });

  const isActive = watch("is_active");

  useEffect(() => {
    if (open) {
      if (mod) {
        reset({
          name: mod.name,
          code: mod.code,
          professor_id: mod.professor_id,
          academic_period_id: mod.academic_period_id,
          credits: mod.credits,
          max_absences: mod.max_absences,
          is_active: mod.is_active,
        });
      } else {
        reset({
          credits: 4,
          max_absences: 10,
          is_active: true,
          professor_id: profile?.role === "professor" ? profile.id : "",
          academic_period_id: "",
          name: "",
          code: "",
        });
      }
    }
  }, [open, mod, reset, profile]);

  const handleFormSubmit = async (data: FormData) => {
    await onSubmit(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar módulo" : "Novo módulo"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="mod-name">Nome *</Label>
              <Input
                id="mod-name"
                placeholder="Ex.: Matemática Aplicada"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mod-code">Código *</Label>
              <Input
                id="mod-code"
                placeholder="Ex.: MAT101"
                className="font-mono uppercase"
                {...register("code")}
              />
              {errors.code && (
                <p className="text-xs text-destructive">{errors.code.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mod-credits">Créditos</Label>
              <Input
                id="mod-credits"
                type="number"
                min={1}
                max={20}
                {...register("credits")}
              />
            </div>
          </div>

          {/* Período */}
          <div className="space-y-1.5">
            <Label>Período acadêmico *</Label>
            <Select
              value={watch("academic_period_id")}
              onValueChange={(v) => setValue("academic_period_id", v)}
              disabled={isEdit || isLoadingPeriods || isPeriodsError}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    isLoadingPeriods
                      ? "Carregando períodos..."
                      : "Selecione o período"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isPeriodsError && (
              <p className="text-xs text-destructive">
                Não foi possível carregar os períodos
                {periodsError instanceof Error
                  ? `: ${periodsError.message}`
                  : "."}{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => refetchPeriods()}
                >
                  Tentar novamente
                </button>
              </p>
            )}
            {!isLoadingPeriods && !isPeriodsError && periods.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum período ativo. Crie um período acadêmico ativo antes de
                cadastrar módulos.
              </p>
            )}
            {errors.academic_period_id && (
              <p className="text-xs text-destructive">
                {errors.academic_period_id.message}
              </p>
            )}
          </div>

          {/* Professor */}
          {canChangeProfessor ? (
            <div className="space-y-1.5">
              <Label>Professor responsável *</Label>
              <Select
                value={watch("professor_id")}
                onValueChange={(v) => setValue("professor_id", v)}
                disabled={isLoadingProfessors || isProfessorsError}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isLoadingProfessors
                        ? "Carregando professores..."
                        : "Selecione o professor"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {professors.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isProfessorsError && (
                <p className="text-xs text-destructive">
                  Não foi possível carregar os professores
                  {professorsError instanceof Error
                    ? `: ${professorsError.message}`
                    : "."}{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground"
                    onClick={() => refetchProfessors()}
                  >
                    Tentar novamente
                  </button>
                </p>
              )}
              {!isLoadingProfessors &&
                !isProfessorsError &&
                professors.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhum professor cadastrado. Cadastre um usuário com o papel
                    &ldquo;Professor&rdquo; na página de Usuários.
                  </p>
                )}
              {errors.professor_id && (
                <p className="text-xs text-destructive">
                  {errors.professor_id.message}
                </p>
              )}
            </div>
          ) : null}

          {/* Faltas máximas */}
          <div className="space-y-1.5">
            <Label htmlFor="mod-max-absences">Máximo de faltas</Label>
            <Input
              id="mod-max-absences"
              type="number"
              min={0}
              {...register("max_absences")}
            />
          </div>

          {/* Ativo */}
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Switch
              id="mod-active"
              checked={isActive}
              onChange={(e) => setValue("is_active", e.target.checked)}
              label="Módulo ativo"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              {isEdit ? "Salvar alterações" : "Criar módulo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
