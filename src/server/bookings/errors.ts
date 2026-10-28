import { isPostgresError } from "@/server/db-errors";

/** Запись пересеклась с другой записью мастера (constraint booking_no_overlap, SQLSTATE 23P01). */
export function isBookingOverlapError(error: unknown): boolean {
  return isPostgresError(error, "23P01", "booking_no_overlap");
}
