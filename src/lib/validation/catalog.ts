import { z } from "zod";
import {
  durationField,
  requiredText,
  rublesField,
  sortOrderField,
  textField,
} from "./common";

export const categorySchema = z.object({
  name: requiredText(1, 60),
  sortOrder: sortOrderField,
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const serviceSchema = z.object({
  categoryId: z.string().min(1, "Выберите категорию"),
  name: requiredText(2, 80),
  description: textField(500),
  durationMin: durationField,
  priceRub: rublesField,
  // null — буфер по умолчанию из настроек салона
  bufferMin: z
    .number({ error: "Введите число" })
    .int("Целое число минут")
    .min(0, "Не меньше 0")
    .max(120, "Не больше 2 часов")
    .refine((value) => value % 5 === 0, "Шаг — 5 минут")
    .nullable(),
  isActive: z.boolean(),
  sortOrder: sortOrderField,
});
export type ServiceInput = z.infer<typeof serviceSchema>;
