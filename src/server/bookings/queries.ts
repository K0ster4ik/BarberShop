import "server-only";
import { salonTimeToInstant, toSalonDate } from "@/lib/time";
import { bookingScope, type StaffUser } from "@/server/auth/access";
import { db } from "@/server/db";
import { ACTIVE_BOOKING_STATUSES } from "./status";

/** Сколько активных записей сегодня; MASTER видит только свои. */
export async function countTodayBookings(staff: StaffUser, now: Date) {
  const today = toSalonDate(now);
  return db.booking.count({
    where: {
      ...bookingScope(staff),
      deletedAt: null,
      status: { in: ACTIVE_BOOKING_STATUSES },
      startsAt: {
        gte: salonTimeToInstant(today, 0),
        lt: salonTimeToInstant(today, 24 * 60),
      },
    },
  });
}
