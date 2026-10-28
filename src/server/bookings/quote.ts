import { salon, type SalonSettings } from "@/config/salon";
import { salonTimeToInstant, timeToMinutes } from "@/lib/time";
import { ANY_MASTER, type BookingSelection } from "@/lib/validation/booking";
import { DomainError, type Db } from "@/server/errors";
import {
  calculatePricing,
  type PricingResult,
  type PromoCodeOffer,
} from "@/server/pricing/calculate";
import type { Discount } from "@/server/pricing/discount";
import { loadAvailability } from "./availability";
import { loadOffers, type MasterOffer } from "./offer";

// Выбор клиента → конкретный мастер, время и цена (DESIGN.md, 6.4 и 7.3). Этим же
// расчётом пользуются и шаг подтверждения, и создание записи — цены не расходятся.

export const SLOT_TAKEN = "Это время только что заняли. Выберите другое.";
export const MASTER_UNAVAILABLE =
  "Мастер больше не делает выбранные услуги. Выберите другого.";
export const PROMO_NOT_FOUND = "Такого промокода нет";

export type PromoCodeMatch = PromoCodeOffer & { code: string };

export type ResolvedSelection = {
  visitAt: Date;
  // Мастера, свободные в это время: для «любого» — от наименее загруженного,
  // для конкретного — он один.
  candidates: MasterOffer[];
};

export async function resolveSelection(
  db: Db,
  selection: BookingSelection,
  now: Date,
  settings: SalonSettings = salon,
): Promise<ResolvedSelection> {
  const all = await loadOffers(db, selection.serviceIds, settings);
  const offers =
    selection.masterId === ANY_MASTER
      ? all
      : all.filter((offer) => offer.master.id === selection.masterId);
  if (offers.length === 0) throw new DomainError(MASTER_UNAVAILABLE);

  const visitAt = salonTimeToInstant(
    selection.date,
    timeToMinutes(selection.time) ?? Number.NaN,
    settings.timezone,
  );
  const availability = await loadAvailability(
    db,
    offers,
    [selection.date],
    now,
    settings,
  );
  const slot = availability
    .get(selection.date)
    ?.find((candidate) => candidate.start.getTime() === visitAt.getTime());
  if (!slot) throw new DomainError(SLOT_TAKEN);

  const byId = new Map(offers.map((offer) => [offer.master.id, offer]));
  return {
    visitAt,
    candidates: slot.masterIds.flatMap((id) => byId.get(id) ?? []),
  };
}

/** Постоянная скидка клиента по телефону; null — клиента нет или скидки нет. */
export async function loadClientDiscount(
  db: Db,
  phone: string | null,
): Promise<Discount | null> {
  if (!phone) return null;
  const client = await db.client.findUnique({
    where: { phone },
    select: { discountKind: true, discountValue: true },
  });
  return client?.discountKind && client.discountValue
    ? { kind: client.discountKind, value: client.discountValue }
    : null;
}

/** Промокод по тексту с числом использований; null — такого кода нет. */
export async function loadPromoCode(
  db: Db,
  code: string,
): Promise<PromoCodeMatch | null> {
  const row = await db.promoCode.findUnique({
    where: { code: code.trim().toUpperCase() },
    select: {
      id: true,
      code: true,
      kind: true,
      value: true,
      isActive: true,
      validFrom: true,
      validUntil: true,
      maxUses: true,
    },
  });
  if (!row) return null;
  return { ...row, uses: await countPromoCodeUses(db, row.id) };
}

/** Использованием считается любая неотменённая и неудалённая запись с кодом. */
export function countPromoCodeUses(db: Db, promoCodeId: string) {
  return db.booking.count({
    where: { promoCodeId, status: { not: "CANCELLED" }, deletedAt: null },
  });
}

export function priceOffer(
  offer: MasterOffer,
  visitAt: Date,
  now: Date,
  extras: {
    clientDiscount?: Discount | null;
    promoCode?: PromoCodeOffer | null;
  } = {},
): PricingResult {
  return calculatePricing({
    services: offer.services,
    promotions: offer.promotions,
    visitAt,
    now,
    clientDiscount: extras.clientDiscount,
    promoCode: extras.promoCode,
    settings: salon,
  });
}

export type BookingQuote = {
  visitAt: Date;
  offer: MasterOffer;
  pricing: PricingResult;
  promoCode: PromoCodeMatch | null;
  clientDiscount: Discount | null;
};

/**
 * Цена на шаге подтверждения. Телефон нужен для постоянной скидки клиента,
 * промокод — для его проверки; без них считается цена со скидками мастера.
 */
export async function quoteBooking(
  db: Db,
  selection: BookingSelection,
  extras: { phone: string | null; promoCode: string },
  now: Date,
  settings: SalonSettings = salon,
): Promise<BookingQuote> {
  const { visitAt, candidates } = await resolveSelection(
    db,
    selection,
    now,
    settings,
  );
  const offer = candidates[0];
  if (!offer) throw new DomainError(SLOT_TAKEN);
  const [clientDiscount, promoCode] = await Promise.all([
    loadClientDiscount(db, extras.phone),
    extras.promoCode ? loadPromoCode(db, extras.promoCode) : null,
  ]);
  if (extras.promoCode && !promoCode) {
    throw new DomainError(PROMO_NOT_FOUND, "promoCode");
  }
  return {
    visitAt,
    offer,
    promoCode,
    clientDiscount,
    pricing: priceOffer(offer, visitAt, now, { clientDiscount, promoCode }),
  };
}
