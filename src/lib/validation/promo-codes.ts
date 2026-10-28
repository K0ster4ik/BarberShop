import { z } from "zod";
import { discountKindField, optionalDateField, refineDiscount } from "./common";

/** Промокод хранится в верхнем регистре: «welcome10» и «WELCOME10» — один код. */
export const PROMO_CODE_PATTERN = /^[A-Z0-9_-]{3,20}$/;

export const promoCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        PROMO_CODE_PATTERN,
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
