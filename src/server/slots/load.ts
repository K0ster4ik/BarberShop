import { salon } from "@/config/salon";
import {
  addDays,
  type DateString,
  MINUTES_PER_DAY,
  salonTimeToInstant,
  weekdayOf,
} from "@/lib/time";
import { ACTIVE_BOOKING_STATUSES } from "@/server/bookings/status";
import type { Db } from "@/server/errors";
import type { Interval } from "./available";

// Данные для getAvailableSlots: график, отсутствия и записи мастеров по дням.

export type MasterDay = {
  masterId: string;
  workingHours: { startMin: number; endMin: number }[];
  timeOffs: Interval[];
  bookings: Interval[]; // [startsAt, blockedUntil)
  bookedMin: number; // занятые минуты за день — для выбора «любого мастера»
};

/**
 * Расписание мастеров на дни с `from` по `to` включительно — тремя запросами на весь
 * диапазон: календарь записи проверяет 30 дней сразу.
 */
export async function loadMasterSchedule(
  db: Db,
  masterIds: readonly string[],
  from: DateString,
  to: DateString,
  timezone: string = salon.timezone,
  // Переносимая запись не должна занимать своё же время.
  excludeBookingId?: string,
): Promise<(date: DateString) => MasterDay[]> {
  const ids = [...masterIds];
  const rangeStart = salonTimeToInstant(from, 0, timezone);
  // С запасом в сутки после конца диапазона: уборка последней записи может уйти
  // за полночь и упереться в то, что уже стоит на следующий день.
  const rangeEnd = salonTimeToInstant(addDays(to, 2), 0, timezone);
  const overlapsRange = { masterId: { in: ids }, startsAt: { lt: rangeEnd } };

  const [hours, timeOffs, bookings] = await Promise.all([
    db.workingHours.findMany({
      where: { masterId: { in: ids } },
      select: { masterId: true, weekday: true, startMin: true, endMin: true },
      orderBy: { startMin: "asc" },
    }),
    db.timeOff.findMany({
      where: { ...overlapsRange, endsAt: { gt: rangeStart } },
      select: { masterId: true, startsAt: true, endsAt: true },
    }),
    db.booking.findMany({
      where: {
        ...overlapsRange,
        blockedUntil: { gt: rangeStart },
        status: { in: ACTIVE_BOOKING_STATUSES },
        deletedAt: null,
        ...(excludeBookingId && { id: { not: excludeBookingId } }),
      },
      select: {
        masterId: true,
        startsAt: true,
        blockedUntil: true,
        durationMin: true,
      },
    }),
  ]);

  return (date) => {
    const dayStart = salonTimeToInstant(date, 0, timezone);
    const dayEnd = salonTimeToInstant(date, MINUTES_PER_DAY, timezone);
    const windowEnd = salonTimeToInstant(date, 2 * MINUTES_PER_DAY, timezone);
    const weekday = weekdayOf(date);
    const touches = (start: Date, end: Date) =>
      start < windowEnd && end > dayStart;

    return ids.map((masterId) => {
      const own = bookings.filter(
        (row) =>
          row.masterId === masterId && touches(row.startsAt, row.blockedUntil),
      );
      return {
        masterId,
        workingHours: hours
          .filter((row) => row.masterId === masterId && row.weekday === weekday)
          .map(({ startMin, endMin }) => ({ startMin, endMin })),
        timeOffs: timeOffs
          .filter(
            (row) =>
              row.masterId === masterId && touches(row.startsAt, row.endsAt),
          )
          .map((row) => ({ start: row.startsAt, end: row.endsAt })),
        bookings: own.map((row) => ({
          start: row.startsAt,
          end: row.blockedUntil,
        })),
        bookedMin: own
          .filter((row) => row.startsAt >= dayStart && row.startsAt < dayEnd)
          .reduce((sum, row) => sum + row.durationMin, 0),
      };
    });
  };
}

/** Расписание мастеров на один день. */
export async function loadMasterDays(
  db: Db,
  masterIds: readonly string[],
  date: DateString,
  timezone: string = salon.timezone,
  excludeBookingId?: string,
): Promise<MasterDay[]> {
  const schedule = await loadMasterSchedule(
    db,
    masterIds,
    date,
    date,
    timezone,
    excludeBookingId,
  );
  return schedule(date);
}
