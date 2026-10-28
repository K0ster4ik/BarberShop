import { isSupportedCountry } from "libphonenumber-js";
import { z } from "zod";
import { type CountryCode, normalizePhone } from "@/lib/phone";
import { timeToMinutes } from "@/lib/time";
import { dateField, requiredText, textField } from "./common";
import { PROMO_CODE_PATTERN } from "./promo-codes";

// Запись с сайта (DESIGN.md, 7.1–7.2). Схемы общие для браузера и сервера.

export const MAX_SERVICES_PER_BOOKING = 5;
export const ANY_MASTER = "any";

const idField = z.string().regex(/^[a-z0-9]{8,40}$/, "Неверный идентификатор");

/** Выбор на первых шагах: услуги, мастер (или «любой»), дата и время по часам салона. */
export const bookingSelectionShape = {
  serviceIds: z
    .array(idField)
    .min(1, "Выберите услугу")
    .max(
      MAX_SERVICES_PER_BOOKING,
      `Не больше ${MAX_SERVICES_PER_BOOKING} услуг за один визит`,
    )
    .refine((ids) => new Set(ids).size === ids.length, "Услуга выбрана дважды"),
  masterId: z.union([z.literal(ANY_MASTER), idField]),
  date: dateField,
  time: z
    .string()
    .refine((value) => timeToMinutes(value) !== null, "Выберите время"),
};

export const bookingSelectionSchema = z.object(bookingSelectionShape);
export type BookingSelection = z.infer<typeof bookingSelectionSchema>;

const contactsShape = {
  name: requiredText(2, 60),
  country: z
    .string()
    // Явный boolean: иначе TypeScript выведет type guard, и тип поля станет
    // списком кодов стран — вход и выход формы перестанут совпадать.
    .refine((value): boolean => isSupportedCountry(value), "Выберите страну"),
  phone: z.string().trim().min(1, "Введите телефон"),
  comment: textField(500),
  promoCode: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (value) => value === "" || PROMO_CODE_PATTERN.test(value),
      "Такого промокода не бывает: только латиница и цифры",
    ),
  consent: z.boolean().refine(Boolean, "Нужно согласие на обработку данных"),
};

function refinePhone(
  input: { country: string; phone: string },
  ctx: z.RefinementCtx,
) {
  if (
    input.phone &&
    isSupportedCountry(input.country) &&
    !normalizePhone(input.phone, input.country as CountryCode)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["phone"],
      message: "Проверьте номер: так телефоны не пишут",
    });
  }
}

/** Форма последнего шага: контакты, промокод и согласие. */
export const bookingContactsSchema = z
  .object(contactsShape)
  .superRefine(refinePhone);
export type BookingContacts = z.infer<typeof bookingContactsSchema>;

/**
 * Запрос на создание записи. `expected*` — итог, мастер и длительность, которые видел
 * клиент: если что-то из этого успело измениться, сервер не записывает, а показывает новое. `website` — ловушка
 * для ботов, человек его не видит и не заполняет.
 */
export const createBookingSchema = z
  .object({
    ...bookingSelectionShape,
    ...contactsShape,
    expectedTotal: z.number().int().min(0),
    expectedMasterId: idField,
    expectedDurationMin: z.number().int().positive(),
    website: z.string(),
  })
  .superRefine(refinePhone);
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
