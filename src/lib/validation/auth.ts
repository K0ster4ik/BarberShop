import { z } from "zod";

// Одна схема для формы (React Hook Form) и для Server Action.
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Введите email")
    .pipe(z.email("Некорректный email")),
  password: z.string().min(1, "Введите пароль"),
});

export type LoginInput = z.infer<typeof loginSchema>;
