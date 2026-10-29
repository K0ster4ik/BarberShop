import { salon } from "@/config/salon";
import {
  addDays,
  formatSalonVisit,
  minutesToTime,
  toSalonDate,
  toSalonMinutes,
} from "@/lib/time";
import { loadAvailability } from "@/server/bookings/availability";
import {
  type CatalogService,
  loadBookingCatalog,
  loadOffers,
  offerPrice,
} from "@/server/bookings/offer";
import type { Db } from "@/server/errors";

// Данные главной страницы: витрина услуг и мастера с ближайшим свободным временем.

const NEAREST_DAYS = 7;

export type FeaturedService = CatalogService & { categoryName: string };

/**
 * Услуги для витрины: по одной из каждой категории по кругу, чтобы на первом экране
 * были и стрижки, и борода, и комплексы.
 */
export async function loadFeaturedServices(
  db: Db,
  now: Date,
  limit = 6,
): Promise<FeaturedService[]> {
  const categories = await loadBookingCatalog(db, now);
  const featured: FeaturedService[] = [];
  for (let round = 0; featured.length < limit; round++) {
    const picked = categories.flatMap((category) => {
      const service = category.services[round];
      return service ? [{ ...service, categoryName: category.name }] : [];
    });
    if (picked.length === 0) break;
    featured.push(...picked.slice(0, limit - featured.length));
  }
  return featured;
}

export type MasterCard = {
  id: string;
  name: string;
  title: string | null;
  photoPath: string | null;
  // Не делает услугу — не «всё занято»: на карточке нет ни цены, ни времени.
  offersService: boolean;
  price: number | null; // цена мастера на услугу с действующими акциями
  nearest: { date: string; time: string; label: string } | null;
};

/**
 * Активные мастера и ближайшее свободное время на услугу `serviceId` (самую ходовую —
 * первую в прайсе) в пределах недели. У мастера, который её не делает, времени нет.
 */
export async function loadMasterCards(
  db: Db,
  serviceId: string | null,
  now: Date,
): Promise<MasterCard[]> {
  const masters = await db.master.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, title: true, photoPath: true },
  });
  const none = { offersService: false, price: null, nearest: null };
  if (!serviceId) return masters.map((master) => ({ ...master, ...none }));

  const offers = await loadOffers(db, [serviceId]);
  const today = toSalonDate(now);
  const dates = Array.from({ length: NEAREST_DAYS }, (_, index) =>
    addDays(today, index),
  );
  const availability = await loadAvailability(db, offers, dates, now);
  const nearestOf = (masterId: string) => {
    for (const date of dates) {
      const slot = availability
        .get(date)
        ?.find((candidate) => candidate.masterIds.includes(masterId));
      if (slot) {
        return {
          date,
          time: minutesToTime(toSalonMinutes(slot.start)),
          label: formatNearest(slot.start, now),
        };
      }
    }
    return null;
  };
  return masters.map((master) => {
    const offer = offers.find((row) => row.master.id === master.id);
    if (!offer) return { ...master, ...none };
    return {
      ...master,
      offersService: true,
      price: offerPrice(offer, now).subtotal,
      nearest: nearestOf(master.id),
    };
  });
}

/** «сегодня 17:30», «завтра 10:00», иначе «пт, 31 октября в 10:00». */
export function formatNearest(
  instant: Date,
  now: Date,
  timezone: string = salon.timezone,
): string {
  const date = toSalonDate(instant, timezone);
  const today = toSalonDate(now, timezone);
  const time = minutesToTime(toSalonMinutes(instant, timezone));
  if (date === today) return `сегодня ${time}`;
  if (date === addDays(today, 1)) return `завтра ${time}`;
  return formatSalonVisit(instant);
}
