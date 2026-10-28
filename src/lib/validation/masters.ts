import { z } from "zod";
import { timeToMinutes } from "@/lib/time";
import {
  dateField,
  discountKindField,
  durationField,
  optionalDateField,
  refineDiscount,
  requiredText,
  rublesField,
  sortOrderField,
  textField,
  timeField,
} from "./common";

export const masterProfileSchema = z.object({
  name: requiredText(2, 60),
  title: textField(60),
  bio: textField(600),
  isActive: z.boolean(),
  sortOrder: sortOrderField,
});
export type MasterProfileInput = z.infer<typeof masterProfileSchema>;

export const masterServiceSchema = z.object({
  serviceId: z.string().min(1, "Выберите услугу"),
  priceRub: rublesField,
  durationMin: durationField,
});
export type MasterServiceInput = z.infer<typeof masterServiceSchema>;

export const promotionSchema = z
  .object({
    title: requiredText(2, 80),
    serviceId: z.string(), // "" — на все услуги мастера
    kind: discountKindField,
    value: z.number({ error: "Введите размер скидки" }),
    validFrom: optionalDateField,
    validUntil: optionalDateField, // включительно
    isActive: z.boolean(),
  })
  .superRefine(refineDiscount);
export type PromotionInput = z.infer<typeof promotionSchema>;

export const MAX_INTERVALS_PER_DAY = 4;

const intervalSchema = z.object({ start: timeField, end: timeField });

/**
 * Недельный график: 7 дней (0 = Пн), в каждом — интервалы работы.
 * Интервалы одного дня не пересекаются; шаг — 5 минут.
 */
export const weekScheduleSchema = z
  .object({
    days: z.array(z.array(intervalSchema)).length(7),
  })
  .superRefine((input, ctx) => {
    input.days.forEach((intervals, day) => {
      if (intervals.length > MAX_INTERVALS_PER_DAY) {
        ctx.addIssue({
          code: "custom",
          path: ["days", day],
          message: `Не больше ${MAX_INTERVALS_PER_DAY} интервалов в день`,
        });
      }
      const parsed = intervals.map((interval, index) => ({
        index,
        start: timeToMinutes(interval.start),
        end: timeToMinutes(interval.end),
      }));
      for (const { index, start, end } of parsed) {
        if (start === null || end === null) continue;
        if (start % 5 !== 0 || end % 5 !== 0) {
          ctx.addIssue({
            code: "custom",
            path: ["days", day, index, "end"],
            message: "Шаг — 5 минут",
          });
        } else if (start >= end) {
          ctx.addIssue({
            code: "custom",
            path: ["days", day, index, "end"],
            message: "Конец раньше начала",
          });
        }
      }
      const sorted = parsed
        .filter((interval) => interval.start !== null && interval.end !== null)
        .toSorted((a, b) => (a.start ?? 0) - (b.start ?? 0));
      for (let i = 1; i < sorted.length; i++) {
        const previous = sorted[i - 1];
        const current = sorted[i];
        if (previous && current && (current.start ?? 0) < (previous.end ?? 0)) {
          ctx.addIssue({
            code: "custom",
            path: ["days", day, current.index, "start"],
            message: "Интервалы пересекаются",
          });
        }
      }
    });
  });
export type WeekScheduleInput = z.infer<typeof weekScheduleSchema>;

const DAY_MS = 24 * 60 * 60 * 1000;

export const timeOffSchema = z
  .object({
    allDay: z.boolean(),
    fromDate: dateField,
    fromTime: z.string(),
    toDate: dateField, // включительно, если allDay
    toTime: z.string(),
    reason: textField(100),
  })
  .superRefine((input, ctx) => {
    if (input.allDay) {
      if (input.toDate < input.fromDate) {
        ctx.addIssue({
          code: "custom",
          path: ["toDate"],
          message: "Дата окончания раньше даты начала",
        });
      }
      return;
    }
    const from = timeToMinutes(input.fromTime);
    const to = timeToMinutes(input.toTime);
    for (const [path, minutes] of [
      ["fromTime", from],
      ["toTime", to],
    ] as const) {
      if (minutes === null) {
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: "Укажите время",
        });
      } else if (minutes % 5 !== 0) {
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: "Шаг — 5 минут",
        });
      }
    }
    if (from === null || to === null) return;
    // Сравниваем минуты, а не строки: «20-го 24:00 — 21-го 00:00» — это ноль минут.
    const days =
      (Date.parse(input.toDate) - Date.parse(input.fromDate)) / DAY_MS;
    if (days * 24 * 60 + to - from <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["toTime"],
        message: "Окончание раньше начала",
      });
    }
  });
export type TimeOffInput = z.infer<typeof timeOffSchema>;
