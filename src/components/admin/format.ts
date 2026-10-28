import {
  addDays,
  formatSalonDate,
  formatSalonDateRange,
  formatSalonDateTimeRange,
  salonTimeToInstant,
  toSalonDate,
  toSalonMinutes,
} from "@/lib/time";

// Подписи для списков админки (серверные компоненты): периоды скидок, статусы, перерывы.

/** Полдень даты формы («2026-11-30»): так часовой пояс не сдвинет её на соседние сутки. */
function noon(date: string): Date {
  return salonTimeToInstant(date, 12 * 60);
}

/** Дата формы → «30 ноября 2026 г.». */
export function formatDay(date: string): string {
  return formatSalonDate(noon(date));
}

/** Период скидки по датам формы («с … по …» включительно). */
export function formatDiscountPeriod(from: string, until: string): string {
  if (!from && !until) return "бессрочно";
  if (!until) return `с ${formatDay(from)}`;
  if (!from) return `по ${formatDay(until)}`;
  return formatSalonDateRange(noon(from), noon(until));
}

export type DiscountStatus = "active" | "scheduled" | "ended" | "off";

export function discountStatus(
  row: { isActive: boolean; validFrom: Date | null; validUntil: Date | null },
  now: Date,
): DiscountStatus {
  if (!row.isActive) return "off";
  if (row.validUntil && now >= row.validUntil) return "ended";
  if (row.validFrom && now < row.validFrom) return "scheduled";
  return "active";
}

/** Отсутствие на целые дни — датами («5–9 ноября 2026 г.»), иначе — с временем. */
export function formatTimeOffPeriod(startsAt: Date, endsAt: Date): string {
  const wholeDays =
    toSalonMinutes(startsAt) === 0 && toSalonMinutes(endsAt) === 0;
  if (!wholeDays) return formatSalonDateTimeRange(startsAt, endsAt);
  const last = addDays(toSalonDate(endsAt), -1);
  return formatSalonDateRange(noon(toSalonDate(startsAt)), noon(last));
}
