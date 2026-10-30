import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import {
  discountKindField,
  optionalDateField,
  refineDiscount,
  requiredText,
} from "./common";

// Карточка клиента в CRM (DESIGN.md, 8.1): контакты, постоянная скидка, теги, заметки.

export const clientProfileSchema = z.object({
  name: requiredText(2, 60),
  phone: z
    .string()
    .trim()
    .min(1, "Введите телефон")
    .refine(
      (value) => normalizePhone(value) !== null,
      "Проверьте номер: российский или международный с +",
    ),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      (value) => value === "" || z.email().safeParse(value).success,
      "Некорректный email",
    ),
  // "" — не указан. Сравнение строк ГГГГ-ММ-ДД: будущая дата — опечатка.
  birthday: optionalDateField.refine(
    (value) => value === "" || value <= new Date().toISOString().slice(0, 10),
    "Дата рождения не может быть в будущем",
  ),
});
export type ClientProfileInput = z.infer<typeof clientProfileSchema>;

/** Постоянная скидка: процент или рубли; enabled = false — скидки нет. */
export const clientDiscountSchema = z
  .object({
    enabled: z.boolean(),
    kind: discountKindField,
    value: z.number().nullable(),
  })
  .superRefine((input, ctx) => {
    if (!input.enabled) return;
    if (input.value === null || Number.isNaN(input.value)) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Введите размер скидки",
      });
      return;
    }
    refineDiscount(
      { kind: input.kind, value: input.value, validFrom: "", validUntil: "" },
      ctx,
    );
  });
export type ClientDiscountInput = z.infer<typeof clientDiscountSchema>;

/** Цвета бейджей тегов — из палитры, которую держат обе темы. */
export const TAG_COLORS = [
  "amber",
  "emerald",
  "rose",
  "sky",
  "violet",
  "slate",
] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export const tagSchema = z.object({
  name: requiredText(1, 30),
  color: z.enum(TAG_COLORS),
});
export type TagInput = z.infer<typeof tagSchema>;

export const clientNoteSchema = z.object({
  text: requiredText(1, 1000),
});
export type ClientNoteInput = z.infer<typeof clientNoteSchema>;

/** Подборки списка клиентов (8.2). */
export const CLIENT_SEGMENTS = ["all", "sleeping", "new"] as const;
export type ClientSegment = (typeof CLIENT_SEGMENTS)[number];
