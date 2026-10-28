import { z } from "zod";
import { requiredText } from "./common";

const roleField = z.enum(["OWNER", "ADMIN", "MASTER"]);
const passwordField = z
  .string()
  .min(8, "Не меньше 8 символов")
  .max(128, "Не больше 128 символов");

/** Мастеру нужна карточка мастера, остальным ролям — нет. */
function refineMasterLink(
  input: { role: "OWNER" | "ADMIN" | "MASTER"; masterId: string },
  ctx: z.RefinementCtx,
): void {
  if (input.role === "MASTER" && !input.masterId) {
    ctx.addIssue({
      code: "custom",
      path: ["masterId"],
      message: "Выберите карточку мастера",
    });
  }
}

export const userCreateSchema = z
  .object({
    name: requiredText(2, 60),
    email: z.string().trim().toLowerCase().pipe(z.email("Некорректный email")),
    role: roleField,
    password: passwordField,
    masterId: z.string(), // "" — без карточки мастера
  })
  .superRefine(refineMasterLink);
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z
  .object({
    name: requiredText(2, 60),
    role: roleField,
    isActive: z.boolean(),
    masterId: z.string(),
  })
  .superRefine(refineMasterLink);
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const passwordResetSchema = z.object({ password: passwordField });
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
