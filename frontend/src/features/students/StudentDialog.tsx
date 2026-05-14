import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";

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
import type { StudentItem } from "./api";

const schema = z.object({
  student_number: z.string().min(1, "Matrícula é obrigatória"),
  full_name: z.string().min(2, "Nome completo é obrigatório"),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  enrollment_date: z.string().min(1, "Data de matrícula é obrigatória"),
  medical_certificates: z.coerce.number().int().min(0).default(0),
  referral_info: z.string().optional(),
  observations: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface StudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student?: StudentItem;
  onSubmit: (data: FormData) => Promise<void>;
}

export function StudentDialog({
  open,
  onOpenChange,
  student,
  onSubmit,
}: StudentDialogProps) {
  const isEdit = !!student;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { medical_certificates: 0 },
  });

  useEffect(() => {
    if (open) {
      if (student) {
        reset({
          student_number: student.student_number,
          full_name: student.full_name,
          email: student.email ?? "",
          enrollment_date: student.enrollment_date,
          medical_certificates: student.medical_certificates,
          referral_info: student.referral_info ?? "",
          observations: student.observations ?? "",
        });
      } else {
        reset({
          medical_certificates: 0,
          student_number: "",
          full_name: "",
          email: "",
          enrollment_date: new Date().toISOString().split("T")[0],
          referral_info: "",
          observations: "",
        });
      }
    }
  }, [open, student, reset]);

  const handleFormSubmit = async (data: FormData) => {
    // Remove e-mail vazio para não enviar string vazia
    if (!data.email) delete data.email;
    await onSubmit(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar aluno" : "Novo aluno"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="student-number">Matrícula *</Label>
              <Input
                id="student-number"
                placeholder="Ex.: 20240001"
                className="font-mono"
                disabled={isEdit}
                {...register("student_number")}
              />
              {errors.student_number && (
                <p className="text-xs text-destructive">
                  {errors.student_number.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="enrollment-date">Data de matrícula *</Label>
              <Input
                id="enrollment-date"
                type="date"
                {...register("enrollment_date")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="full-name">Nome completo *</Label>
            <Input
              id="full-name"
              placeholder="Ex.: Maria Silva Souza"
              {...register("full_name")}
            />
            {errors.full_name && (
              <p className="text-xs text-destructive">
                {errors.full_name.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="aluno@email.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="med-cert">Certificados médicos</Label>
              <Input
                id="med-cert"
                type="number"
                min={0}
                {...register("medical_certificates")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="referral">Encaminhamento</Label>
            <Input
              id="referral"
              placeholder="Ex.: Projeto PROUNI"
              {...register("referral_info")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="obs">Observações</Label>
            <textarea
              id="obs"
              rows={3}
              className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              placeholder="Informações adicionais..."
              {...register("observations")}
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
              {isEdit ? "Salvar alterações" : "Adicionar aluno"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
