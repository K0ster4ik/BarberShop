import { z } from "zod";
import { timeToMinutes } from "@/lib/time";

// Общие поля форм справочников. Деньги в формах — в рублях, в БД — в копейках
// (перевод в src/lib/money.ts на сервере).

const MAX_RUBLES = 1_000_000;

function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

export const rublesField = z
  .number({ error: "Введите сумму" })
  .min(0, "Сумма не может быть отрицательной")
  .max(MAX_RUBLES, "Слишком большая сумма")
  .refine(hasAtMostTwoDecimals, "Не больше двух знаков после запятой");

export const durationField = z
  .number({ error: "Введите длительность" })
  .int("Целое число минут")
  .min(5, "Не меньше 5 минут")
  .max(600, "Не больше 10 часов")
  .refine((value) => value % 5 === 0, "Шаг — 5 минут");

export const sortOrderField = z
  .number({ error: "Введите число" })
  .int("Целое число")
  .min(0, "Не меньше 0")
  .max(999, "Не больше 999");

export const textField = (max: number) =>
  z.string().trim().max(max, `Не больше ${max} символов`);

export const requiredText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? "Заполните поле" : `Не меньше ${min} символов`)
    .max(max, `Не больше ${max} символов`);

// z.iso.date() проверяет и календарь: 2026-02-31 не пройдёт (Date молча сделал бы 3 марта).
const isoDate = z.iso.date();
const isCalendarDate = (value: string) => isoDate.safeParse(value).success;

/** "2026-11-03" или пустая строка (не задано). */
export const optionalDateField = z
  .string()
  .refine((value) => value === "" || isCalendarDate(value), "Укажите дату");

export const dateField = z.string().refine(isCalendarDate, "Укажите дату");

/** "10:15"; «24:00» допустимо как конец суток. */
export const timeField = z
  .string()
  .refine((value) => timeToMinutes(value) !== null, "Укажите время");

export const discountKindField = z.enum(["PERCENT", "AMOUNT"]);

/**
 * Проверка размера скидки и периода действия — общая для акций мастеров
 * и промокодов. value: проценты (1..100) или рубли (> 0).
 */
export function refineDiscount(
  input: {
    kind: "PERCENT" | "AMOUNT";
    value: number;
    validFrom: string;
    validUntil: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (input.kind === "PERCENT") {
    if (
      !Number.isInteger(input.value) ||
      input.value < 1 ||
      input.value > 100
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Процент — целое число от 1 до 100",
      });
    }
  } else if (
    !(input.value > 0) ||
    input.value > MAX_RUBLES ||
    !hasAtMostTwoDecimals(input.value)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message: "Сумма — больше нуля, не больше двух знаков после запятой",
    });
  }
  if (
    input.validFrom &&
    input.validUntil &&
    input.validFrom > input.validUntil
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["validUntil"],
      message: "Дата окончания раньше даты начала",
    });
  }
}
