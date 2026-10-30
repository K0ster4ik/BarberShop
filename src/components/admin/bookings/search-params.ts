import type { BookingStatus } from "@/generated/prisma/enums";
import {
  BOOKING_PERIODS,
  type BookingPeriod,
} from "@/lib/validation/staff-booking";
import type { BookingListFilters } from "@/server/bookings/staff-queries";
import { STATUS_LABELS } from "./labels";

// Фильтры списка записей в адресе: ?q=&period=&status=&master=&page=.

export type FilterValues = Omit<BookingListFilters, "page">;

export function toSearch(values: FilterValues, page = 1): string {
  const params = new URLSearchParams();
  if (values.query) params.set("q", values.query);
  if (values.period !== "upcoming") params.set("period", values.period);
  if (values.status) params.set("status", values.status);
  if (values.masterId) params.set("master", values.masterId);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `?${search}` : "";
}

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/** Параметры адреса → фильтры; всё непонятное заменяется значением по умолчанию. */
export function parseFilters(params: RawParams): BookingListFilters {
  const period = first(params.period);
  const status = first(params.status);
  const master = first(params.master);
  const page = Number.parseInt(first(params.page), 10);
  return {
    period: (BOOKING_PERIODS as readonly string[]).includes(period)
      ? (period as BookingPeriod)
      : "upcoming",
    status: status in STATUS_LABELS ? (status as BookingStatus) : null,
    masterId: /^[a-z0-9]{8,40}$/.test(master) ? master : null,
    query: first(params.q).trim().slice(0, 60),
    page: Number.isInteger(page) && page > 0 && page < 10_000 ? page : 1,
  };
}
