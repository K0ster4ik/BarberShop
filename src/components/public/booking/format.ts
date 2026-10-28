import { formatMoney } from "@/lib/money";
import { plural } from "@/lib/plural";

// Подписи цен и длительности в мастере записи.

export function formatPriceRange(min: number, max: number): string {
  return min === max
    ? formatMoney(min)
    : `${formatMoney(min).replace(/\s?₽$/, "")}–${formatMoney(max)}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

export function formatDurationRange(min: number, max: number): string {
  return min === max
    ? formatDuration(min)
    : `${formatDuration(min)} – ${formatDuration(max)}`;
}

export function servicesCount(count: number): string {
  return `${count} ${plural(count, ["услуга", "услуги", "услуг"])}`;
}
