import { z } from "zod";

// Campos de uma conta nova (o admin cria ou o convidado se cadastra), com os
// mesmos limites do backend (AccountData em schemas/users.py).
export const accountFields = {
  full_name: z.string().min(2, "Nome completo é obrigatório").max(120),
  username: z
    .string()
    .min(2, "Mínimo 2 caracteres")
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, "Use apenas letras, números, ponto, underscore ou hífen"),
  email: z.string().email("E-mail inválido"),
  password: z
    .string()
    .min(8, "Senha deve ter ao menos 8 caracteres")
    .max(72, "Senha muito longa"),
};
