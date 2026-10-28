import { salon } from "@/config/salon";
import {
  type DateString,
  MINUTES_PER_DAY,
  salonTimeToInstant,
  weekdayOf,
} from "@/lib/time";
import { ACTIVE_BOOKING_STATUSES } from "@/server/bookings/status";
import type { Db } from "@/server/errors";
import type { Interval } from "./available";

// Данные для getAvailableSlots: график, отсутствия и записи мастеров на один день.

export type MasterDay = {
  masterId: string;
  workingHours: { startMin: number; endMin: number }[];
  timeOffs: Interval[];
  bookings: Interval[]; // [startsAt, blockedUntil)
  bookedMin: number; // занятые минуты за день — для выбора «любого мастера»
};

export async function loadMasterDays(
  db: Db,
  masterIds: readonly string[],
  date: DateString,
  timezone: string = salon.timezone,
): Promise<MasterDay[]> {
  const dayStart = salonTimeToInstant(date, 0, timezone);
  const dayEnd = salonTimeToInstant(date, MINUTES_PER_DAY, timezone);
  // С запасом в сутки после конца дня: уборка последней записи может уйти за полночь
  // и упереться в то, что уже стоит на завтра.
  const windowEnd = salonTimeToInstant(date, 2 * MINUTES_PER_DAY, timezone);
  const overlapsWindow = {
    masterId: { in: [...masterIds] },
    startsAt: { lt: windowEnd },
  };

  const [hours, timeOffs, bookings] = await Promise.all([
    db.workingHours.findMany({
      where: { masterId: { in: [...masterIds] }, weekday: weekdayOf(date) },
      select: { masterId: true, startMin: true, endMin: true },
      orderBy: { startMin: "asc" },
    }),
    db.timeOff.findMany({
      where: { ...overlapsWindow, endsAt: { gt: dayStart } },
      select: { masterId: true, startsAt: true, endsAt: true },
    }),
    db.booking.findMany({
      where: {
        ...overlapsWindow,
        blockedUntil: { gt: dayStart },
        status: { in: ACTIVE_BOOKING_STATUSES },
        deletedAt: null,
      },
      select: {
        masterId: true,
        startsAt: true,
        blockedUntil: true,
        durationMin: true,
      },
    }),
  ]);

  return masterIds.map((masterId) => {
    const own = bookings.filter((booking) => booking.masterId === masterId);
    return {
      masterId,
      workingHours: hours
        .filter((row) => row.masterId === masterId)
        .map(({ startMin, endMin }) => ({ startMin, endMin })),
      timeOffs: timeOffs
        .filter((row) => row.masterId === masterId)
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
}
