import { z } from "zod";
import { discountKindField, optionalDateField, refineDiscount } from "./common";

export const promoCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[A-Z0-9_-]{3,20}$/,
        "3–20 символов: латинские буквы, цифры, дефис или подчёркивание",
      ),
    kind: discountKindField,
    value: z.number({ error: "Введите размер скидки" }),
    validFrom: optionalDateField,
    validUntil: optionalDateField, // включительно
    maxUses: z
      .number({ error: "Введите число" })
      .int("Целое число")
      .min(1, "Не меньше 1")
      .max(100_000, "Слишком много")
      .nullable(),
    isActive: z.boolean(),
  })
  .superRefine(refineDiscount);
export type PromoCodeInput = z.infer<typeof promoCodeSchema>;
