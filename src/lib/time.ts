import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { salon } from "@/config/salon";

// Время хранится в UTC, а расписание живёт по часам салона (DESIGN.md, 5.2, инвариант 2).
// Только здесь «дата + минуты от полуночи в таймзоне салона» превращаются в момент времени.

/** Календарный день в таймзоне салона: "2026-11-03". */
export type DateString = string;

export const MINUTES_PER_DAY = 24 * 60;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(date: DateString): Date {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!DATE_PATTERN.test(date) || Number.isNaN(parsed.getTime())) {
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
  return fromZonedTime(`${addDays(date, dayOffset)}T${hh}:${mm}:00`, timeZone);
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
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** «3 ноября 2026 г.» по часам салона. */
export function formatSalonDate(instant: Date): string {
  return dateFormat.format(instant);
}

/** «3 нояб., 10:00» по часам салона. */
export function formatSalonDateTime(instant: Date): string {
  return dateTimeFormat.format(instant);
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

/** Целое число минут между моментами (end − start). */
export function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}
