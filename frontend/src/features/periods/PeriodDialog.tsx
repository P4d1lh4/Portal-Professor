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
import { SelectOptionsStatus } from "@/components/shared/SelectOptionsStatus";
import api from "@/lib/axios";
import type { PeriodWithCoordinator } from "./api";

const schema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  coordinator_id: z.string().min(1, "Coordenador é obrigatório"),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  // Sem .default(): ver nota em ModuleDialog — defaultValues/reset já garantem
  // o valor, e o .default() quebrava o tipo com @hookform/resolvers v5.
  is_active: z.boolean(),
});

type FormData = z.infer<typeof schema>;

interface PeriodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period?: PeriodWithCoordinator;
  /** Criar um período novo copiando os módulos deste (P-Q5). */
  cloneFrom?: PeriodWithCoordinator;
  onSubmit: (data: FormData) => Promise<void>;
}

export function PeriodDialog({
  open,
  onOpenChange,
  period,
  cloneFrom,
  onSubmit,
}: PeriodDialogProps) {
  const isEdit = !!period;

  const {
    data: coordinators = [],
    isLoading: isLoadingCoordinators,
    isError: isCoordinatorsError,
    error: coordinatorsError,
    refetch: refetchCoordinators,
  } = useQuery({
    queryKey: ["coordinators"],
    queryFn: () =>
      api.get<{ id: string; full_name: string }[]>("/api/coordinators").then(
        (r) => r.data
      ),
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
    defaultValues: { is_active: true },
  });

  const isActive = watch("is_active");

  useEffect(() => {
    if (open) {
      if (period) {
        reset({
          name: period.name,
          coordinator_id: period.coordinator_id,
          start_date: period.start_date ?? "",
          end_date: period.end_date ?? "",
          is_active: period.is_active,
        });
      } else {
        // No clone, o coordenador do período de origem vem sugerido.
        reset({ is_active: true, name: "", coordinator_id: cloneFrom?.coordinator_id ?? "" });
      }
    }
  }, [open, period, cloneFrom, reset]);

  const handleFormSubmit = async (data: FormData) => {
    await onSubmit(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? "Editar período acadêmico"
              : cloneFrom
                ? `Novo período a partir de ${cloneFrom.name}`
                : "Novo período acadêmico"}
          </DialogTitle>
          {cloneFrom && !isEdit && (
            <p className="text-sm text-muted-foreground">
              Os módulos ativos de {cloneFrom.name} serão copiados, com professor, créditos
              e limite de faltas. Os alunos não são copiados.
            </p>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              placeholder="Ex.: 2024/2"
              {...register("name")}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
            />
            {errors.name && (
              <p id="name-error" className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Coordenador */}
          <div className="space-y-1.5">
            <Label htmlFor="coordinator">Coordenador *</Label>
            <Select
              value={watch("coordinator_id")}
              onValueChange={(v) => setValue("coordinator_id", v)}
              disabled={isLoadingCoordinators || isCoordinatorsError}
            >
              <SelectTrigger
                id="coordinator"
                aria-invalid={!!errors.coordinator_id}
                aria-describedby={errors.coordinator_id ? "coordinator-error" : undefined}
              >
                <SelectValue
                  placeholder={
                    isLoadingCoordinators
                      ? "Carregando coordenadores..."
                      : "Selecione um coordenador"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {coordinators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <SelectOptionsStatus
              isLoading={isLoadingCoordinators}
              isError={isCoordinatorsError}
              error={coordinatorsError}
              count={coordinators.length}
              onRetry={refetchCoordinators}
              errorText="Não foi possível carregar os coordenadores"
              emptyText={
                <>
                  Nenhum coordenador cadastrado. Cadastre um usuário com o papel
                  &ldquo;Coordenador&rdquo; na página de Usuários.
                </>
              }
            />

            {errors.coordinator_id && (
              <p id="coordinator-error" className="text-xs text-destructive">
                {errors.coordinator_id.message}
              </p>
            )}
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start_date">Início</Label>
              <Input id="start_date" type="date" {...register("start_date")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end_date">Fim</Label>
              <Input id="end_date" type="date" {...register("end_date")} />
            </div>
          </div>

          {/* Ativo */}
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Switch
              id="is_active"
              checked={isActive}
              onChange={(e) => setValue("is_active", e.target.checked)}
              label="Período ativo"
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
              {isEdit
                ? "Salvar alterações"
                : cloneFrom
                  ? "Criar e copiar módulos"
                  : "Criar período"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
