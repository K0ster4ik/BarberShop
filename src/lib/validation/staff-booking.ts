import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { timeToMinutes } from "@/lib/time";
import { idField, MAX_SERVICES_PER_BOOKING } from "./booking";
import {
  dateField,
  discountKindField,
  durationField,
  refineDiscount,
  requiredText,
  rublesField,
  textField,
} from "./common";
import { PROMO_CODE_PATTERN } from "./promo-codes";

// Записи в CRM (DESIGN.md, 7.3–7.6): ручная запись, перенос, ручные цены и скидки,
// оплаты. Схемы общие для браузера и сервера; деньги в формах — в рублях.

/** Время визита: шаг 5 минут, как у длительности и графика. */
const visitTimeField = z.string().refine((value) => {
  const minutes = timeToMinutes(value);
  return minutes !== null && minutes < 24 * 60 && minutes % 5 === 0;
}, "Укажите время с шагом 5 минут");

/**
 * Скидка салона на запись: auto — постоянная скидка клиента или промокод (большая),
 * manual — задаёт админ, none — без скидки.
 */
export const salonDiscountSchema = z
  .object({
    mode: z.enum(["auto", "manual", "none"]),
    kind: discountKindField,
    value: z.number().nullable(),
  })
  .superRefine((input, ctx) => {
    if (input.mode !== "manual") return;
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
export type SalonDiscountInput = z.infer<typeof salonDiscountSchema>;

/** Время, мастер и цены — общая часть ручной записи и переноса. */
const visitShape = {
  masterId: idField,
  date: dateField,
  time: visitTimeField,
  durationMin: durationField.nullable(), // null — по услугам
  discount: salonDiscountSchema,
  // Цена услуги вручную, в рублях; null — по прайсу мастера с его акциями.
  prices: z.record(z.string(), rublesField.nullable().optional()),
};

export const STAFF_BOOKING_SOURCES = ["PHONE", "WALK_IN"] as const;

export const staffBookingSchema = z.object({
  ...visitShape,
  phone: z
    .string()
    .trim()
    .min(1, "Введите телефон")
    .refine(
      (value) => normalizePhone(value) !== null,
      "Проверьте номер: российский или международный с +",
    ),
  name: requiredText(2, 60),
  serviceIds: z
    .array(idField)
    .min(1, "Выберите услугу")
    .max(
      MAX_SERVICES_PER_BOOKING,
      `Не больше ${MAX_SERVICES_PER_BOOKING} услуг за один визит`,
    )
    .refine((ids) => new Set(ids).size === ids.length, "Услуга выбрана дважды"),
  source: z.enum(STAFF_BOOKING_SOURCES),
  comment: textField(500),
  promoCode: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (value) => value === "" || PROMO_CODE_PATTERN.test(value),
      "Только латиница, цифры, дефис и подчёркивание",
    ),
});
export type StaffBookingInput = z.infer<typeof staffBookingSchema>;

/** Цена до ввода контактов: без телефона просто не будет постоянной скидки клиента. */
export const staffQuoteSchema = staffBookingSchema.extend({
  phone: z.string().trim().max(40),
  name: z.string().max(60),
});
export type StaffQuoteInput = z.infer<typeof staffQuoteSchema>;

/** Перенос и правка записи: услуги и клиент не меняются, цены — по ключу BookingItem.id. */
export const bookingUpdateSchema = z.object(visitShape);
export type BookingUpdateInput = z.infer<typeof bookingUpdateSchema>;

export const PAYMENT_METHODS = ["CASH", "CARD", "ONLINE"] as const;

export const paymentSchema = z.object({
  amount: rublesField.refine((value) => value > 0, "Сумма больше нуля"),
  method: z.enum(PAYMENT_METHODS),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export const statusChangeSchema = z.object({
  to: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]),
  // Перевод в «Пришёл» сразу с оплатой (DESIGN.md, 7.6).
  payment: paymentSchema.nullable(),
});
export type StatusChangeInput = z.infer<typeof statusChangeSchema>;

/** Период списка записей: с сегодняшнего дня, прошедшие, все. */
export const BOOKING_PERIODS = ["upcoming", "past", "all"] as const;
export type BookingPeriod = (typeof BOOKING_PERIODS)[number];
