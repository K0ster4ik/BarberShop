import { salon, type SalonSettings } from "@/config/salon";
import { DomainError, type Db } from "@/server/errors";
import {
  bookingBufferMin,
  calculatePricing,
  type PricedService,
  type Promotion,
} from "@/server/pricing/calculate";

// Что можно записать на сайте: активные услуги и мастера, которые их делают, с ценами
// и акциями (DESIGN.md, 7.1).

export type OfferService = PricedService & { name: string };

export type MasterOffer = {
  master: {
    id: string;
    name: string;
    title: string | null;
    photoPath: string | null;
  };
  services: OfferService[]; // в порядке выбора клиента
  promotions: Promotion[];
  durationMin: number;
  bufferMin: number;
};

export const SERVICES_UNAVAILABLE =
  "Часть выбранных услуг больше недоступна. Выберите услуги заново.";

/** Мастера, которые делают все выбранные услуги, в порядке вывода на сайте. */
export async function loadOffers(
  db: Db,
  serviceIds: readonly string[],
  settings: Pick<SalonSettings, "defaultBufferMin"> = salon,
): Promise<MasterOffer[]> {
  const ids = [...serviceIds];
  const services = await db.service.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, name: true, bufferMin: true },
  });
  if (services.length !== ids.length)
    throw new DomainError(SERVICES_UNAVAILABLE);
  const serviceById = new Map(services.map((service) => [service.id, service]));

  const masters = await db.master.findMany({
    where: {
      isActive: true,
      AND: ids.map((serviceId) => ({ services: { some: { serviceId } } })),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      title: true,
      photoPath: true,
      services: {
        where: { serviceId: { in: ids } },
        select: { serviceId: true, price: true, durationMin: true },
      },
      promotions: {
        where: { isActive: true },
        select: {
          id: true,
          serviceId: true,
          kind: true,
          value: true,
          isActive: true,
          validFrom: true,
          validUntil: true,
        },
      },
    },
  });

  return masters.map(({ services: own, promotions, ...master }) => {
    const offered = ids.map((serviceId) => {
      const price = own.find((row) => row.serviceId === serviceId);
      const service = serviceById.get(serviceId);
      if (!price || !service) throw new Error(`Missing price ${serviceId}`);
      return {
        serviceId,
        name: service.name,
        basePrice: price.price,
        durationMin: price.durationMin,
        bufferMin: service.bufferMin,
      };
    });
    return {
      master,
      services: offered,
      promotions,
      durationMin: offered.reduce((sum, row) => sum + row.durationMin, 0),
      bufferMin: bookingBufferMin(offered, settings),
    };
  });
}

/** Цена мастера за набор услуг с акциями, действующими в момент `at`. */
export function offerPrice(offer: MasterOffer, at: Date) {
  return calculatePricing({
    services: offer.services,
    promotions: offer.promotions,
    visitAt: at,
    now: at,
    settings: salon,
  });
}

export type CatalogService = {
  id: string;
  name: string;
  description: string | null;
  minPrice: number; // самая низкая цена среди мастеров, с действующими акциями
  maxPrice: number;
  minDurationMin: number;
  maxDurationMin: number;
  masterCount: number;
};

export type CatalogCategory = {
  id: string;
  name: string;
  services: CatalogService[];
};

/** Первый шаг записи: услуги по категориям, только те, что делает хотя бы один мастер. */
export async function loadBookingCatalog(
  db: Db,
  now: Date,
): Promise<CatalogCategory[]> {
  const categories = await db.serviceCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      services: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          bufferMin: true,
          masters: {
            where: { master: { isActive: true } },
            select: {
              price: true,
              durationMin: true,
              master: {
                select: {
                  promotions: {
                    where: { isActive: true },
                    select: {
                      id: true,
                      serviceId: true,
                      kind: true,
                      value: true,
                      isActive: true,
                      validFrom: true,
                      validUntil: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      services: category.services
        .filter((service) => service.masters.length > 0)
        .map((service) => {
          const prices = service.masters.map(
            (row) =>
              calculatePricing({
                services: [
                  {
                    serviceId: service.id,
                    basePrice: row.price,
                    durationMin: row.durationMin,
                    bufferMin: service.bufferMin,
                  },
                ],
                promotions: row.master.promotions,
                visitAt: now,
                now,
                settings: salon,
              }).subtotal,
          );
          const durations = service.masters.map((row) => row.durationMin);
          return {
            id: service.id,
            name: service.name,
            description: service.description,
            minPrice: Math.min(...prices),
            maxPrice: Math.max(...prices),
            minDurationMin: Math.min(...durations),
            maxDurationMin: Math.max(...durations),
            masterCount: service.masters.length,
          };
        }),
    }))
    .filter((category) => category.services.length > 0);
}
