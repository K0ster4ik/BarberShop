import type { BookingStatus } from "@/generated/prisma/enums";

/** Статусы, которые занимают время мастера (DESIGN.md, 5.2, инвариант 10). */
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
];
