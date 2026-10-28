import {
  addDays,
  formatSalonDate,
  formatSalonDateTime,
  salonTimeToInstant,
  toSalonDate,
  toSalonMinutes,
} from "@/lib/time";

// Подписи для списков админки (серверные компоненты): периоды скидок, статусы, перерывы.

/** Дата формы («2026-11-30») → «30 ноября 2026 г.»; полдень — чтобы не съехать на соседние сутки. */
export function formatDay(date: string): string {
  return formatSalonDate(salonTimeToInstant(date, 12 * 60));
}

/** Период скидки по датам формы («с … по …» включительно). */
export function formatDiscountPeriod(from: string, until: string): string {
  if (!from && !until) return "бессрочно";
  if (!until) return `с ${formatDay(from)}`;
  if (!from) return `по ${formatDay(until)}`;
  return `${formatDay(from)} — ${formatDay(until)}`;
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

/** Перерыв на целые дни — датами («5 — 9 ноября»), иначе — с временем. */
export function formatTimeOffPeriod(startsAt: Date, endsAt: Date): string {
  const wholeDays =
    toSalonMinutes(startsAt) === 0 && toSalonMinutes(endsAt) === 0;
  if (!wholeDays) {
    return `${formatSalonDateTime(startsAt)} — ${formatSalonDateTime(endsAt)}`;
  }
  const first = toSalonDate(startsAt);
  const last = addDays(toSalonDate(endsAt), -1);
  return first === last
    ? formatDay(first)
    : `${formatDay(first)} — ${formatDay(last)}`;
}
