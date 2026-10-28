import { salon, type SalonSettings } from "@/config/salon";
import { addDays, type DateString, toSalonDate } from "@/lib/time";
import type { Db } from "@/server/errors";
import {
  type CombinedSlot,
  combineMasterSlots,
} from "@/server/slots/any-master";
import { getAvailableSlots } from "@/server/slots/available";
import { loadMasterSchedule } from "@/server/slots/load";
import type { MasterOffer } from "./offer";

// Свободное время для выбранных услуг: у каждого мастера своя длительность, «любой
// мастер» объединяет всех подходящих (DESIGN.md, 6.4).

/** Дни, на которые можно записаться: сегодня и дальше в пределах горизонта. */
export function bookingDates(
  now: Date,
  settings: Pick<SalonSettings, "timezone" | "bookingHorizonDays"> = salon,
): DateString[] {
  const today = toSalonDate(now, settings.timezone);
  return Array.from({ length: settings.bookingHorizonDays }, (_, index) =>
    addDays(today, index),
  );
}

/** Свободное время по дням для мастеров из `offers`. */
export async function loadAvailability(
  db: Db,
  offers: readonly MasterOffer[],
  dates: readonly DateString[],
  now: Date,
  settings: SalonSettings = salon,
): Promise<Map<DateString, CombinedSlot[]>> {
  const result = new Map<DateString, CombinedSlot[]>();
  const first = dates[0];
  const last = dates.at(-1);
  if (offers.length === 0 || !first || !last) return result;

  const schedule = await loadMasterSchedule(
    db,
    offers.map((offer) => offer.master.id),
    first,
    last,
    settings.timezone,
  );
  for (const date of dates) {
    const days = schedule(date);
    result.set(
      date,
      combineMasterSlots(
        offers.map((offer, index) => {
          const day = days[index];
          if (!day) throw new Error(`No schedule for ${offer.master.id}`);
          return {
            masterId: offer.master.id,
            bookedMin: day.bookedMin,
            slots: getAvailableSlots({
              date,
              durationMin: offer.durationMin,
              bufferMin: offer.bufferMin,
              workingHours: day.workingHours,
              timeOffs: day.timeOffs,
              bookings: day.bookings,
              now,
              settings,
            }),
          };
        }),
      ),
    );
  }
  return result;
}
