import {
  formatInTimeZone,
  fromZonedTime,
  getTimezoneOffset,
} from "date-fns-tz";
import { salon } from "@/config/salon";

// Время хранится в UTC, а расписание живёт по часам салона (DESIGN.md, 5.2, инвариант 2).
// Только здесь «дата + минуты от полуночи в таймзоне салона» превращаются в момент времени.

/** Календарный день в таймзоне салона: "2026-11-03". */
export type DateString = string;

export const MINUTES_PER_DAY = 24 * 60;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(date: DateString): Date {
  const parsed = new Date(`${date}T00:00:00Z`);
  // Обратное сравнение отсекает несуществующие дни: Date переносит 31.02 на 3 марта.
  if (
    !DATE_PATTERN.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new RangeError(`Invalid date string: ${date}`);
  }
  return parsed;
}

/** Какой это день по часам салона. */
export function toSalonDate(
  instant: Date,
  timeZone: string = salon.timezone,
): DateString {
  return formatInTimeZone(instant, timeZone, "yyyy-MM-dd");
}

/** Минуты от полуночи по часам салона: 10:15 → 615. */
export function toSalonMinutes(
  instant: Date,
  timeZone: string = salon.timezone,
): number {
  const [hours = 0, minutes = 0] = formatInTimeZone(instant, timeZone, "HH:mm")
    .split(":")
    .map(Number);
  return hours * 60 + minutes;
}

export function addDays(date: DateString, days: number): DateString {
  const result = parseDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

/** 0 = понедельник … 6 = воскресенье, как в WorkingHours.weekday. */
export function weekdayOf(date: DateString): number {
  return (parseDate(date).getUTCDay() + 6) % 7;
}

/**
 * Момент времени для «дата + минуты от полуночи» по часам салона.
 * Минуты могут выходить за пределы суток (1440 — полночь следующего дня).
 * Переходы на летнее время учитываются: длина суток берётся из правил таймзоны.
 * Времени из пропущенного часа (02:30 при переводе 02:00 → 03:00) не бывает: оно
 * читается со смещением до перехода (как в RFC 5545 и Temporal) и становится 03:30.
 * В повторяющийся час при переводе назад берётся второе, зимнее, время.
 */
export function salonTimeToInstant(
  date: DateString,
  minutes: number,
  timeZone: string = salon.timezone,
): Date {
  if (!Number.isInteger(minutes)) {
    throw new RangeError(`Minutes must be an integer: ${minutes}`);
  }
  const dayOffset = Math.floor(minutes / MINUTES_PER_DAY);
  const minuteOfDay = minutes - dayOffset * MINUTES_PER_DAY;
  const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const mm = String(minuteOfDay % 60).padStart(2, "0");
  const wall = `${addDays(date, dayOffset)}T${hh}:${mm}:00`;
  const instant = fromZonedTime(wall, timeZone);
  if (formatInTimeZone(instant, timeZone, "yyyy-MM-dd'T'HH:mm:ss") === wall) {
    return instant;
  }
  // date-fns-tz сдвигает несуществующее время назад (02:30 → 01:30), и смена с 02:30
  // начиналась бы раньше графика. Берём смещение за сутки до этого момента.
  const naive = Date.parse(`${wall}Z`);
  const offsetBefore = getTimezoneOffset(
    timeZone,
    new Date(naive - MINUTES_PER_DAY * 60_000),
  );
  return new Date(naive - offsetBefore);
}

/** 615 → «10:15», 1440 → «24:00» (конец суток в графике). */
export function minutesToTime(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** «10:15» → 615; допускается «24:00» как конец суток. null — если формат неверный. */
export function timeToMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) return null;
  return hours * 60 + minutes;
}

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: salon.timezone,
  day: "numeric",
  month: "long",
  year: "numeric",
});
const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: salon.timezone,
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const visitFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: salon.timezone,
  weekday: "short",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

/** «ср, 4 ноября в 14:15» по часам салона — время визита для клиента. */
export function formatSalonVisit(instant: Date): string {
  return visitFormat.format(instant);
}

/** «3 ноября 2026 г.» по часам салона. */
export function formatSalonDate(instant: Date): string {
  return dateFormat.format(instant);
}

/** «5–9 ноября 2026 г.», «30 июня – 27 сентября 2026 г.»: общие части Intl не повторяет. */
export function formatSalonDateRange(start: Date, end: Date): string {
  return dateFormat.formatRange(start, end);
}

/** «30 октября 2026 г., 12:00–14:00» по часам салона. */
export function formatSalonDateTimeRange(start: Date, end: Date): string {
  return dateTimeFormat.formatRange(start, end);
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

/** Целое число минут между моментами (end − start). */
export function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}
