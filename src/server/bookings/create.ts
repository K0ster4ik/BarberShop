import { salon, type SalonSettings } from "@/config/salon";
import type { PrismaClient } from "@/generated/prisma/client";
import { type CountryCode, normalizePhone } from "@/lib/phone";
import { addMinutes } from "@/lib/time";
import type { CreateBookingInput } from "@/lib/validation/booking";
import { DomainError } from "@/server/errors";
import type { PricingResult } from "@/server/pricing/calculate";
import { isBookingOverlapError } from "./errors";
import type { MasterOffer } from "./offer";
import {
  type BookingQuote,
  countPromoCodeUses,
  loadClientDiscount,
  loadPromoCode,
  PROMO_NOT_FOUND,
  priceOffer,
  type PromoCodeMatch,
  resolveSelection,
  SLOT_TAKEN,
} from "./quote";
import { createCancelToken } from "./token";

// Запись с сайта (DESIGN.md, 7.2). Время перепроверяется по графику (быстрый отказ),
// а окончательно гонку за слот решает constraint booking_no_overlap.

export const ACTIVE_BOOKING_EXISTS =
  "На этот номер уже есть активная запись. Отменить её можно по ссылке из подтверждения.";
export const PROMO_CODE_RAN_OUT =
  "Промокод только что закончился: лимит использований исчерпан.";

export type CreateBookingResult =
  | {
      status: "created";
      token: string;
      bookingId: string;
      notificationId: string;
    }
  // Цена, мастер (для «любого») или длительность изменились с момента, когда клиент
  // их видел: ничего не записано, клиент подтверждает новую сводку.
  | { status: "changed"; quote: BookingQuote };

export async function createWebsiteBooking(
  db: PrismaClient,
  input: CreateBookingInput,
  now: Date,
  settings: SalonSettings = salon,
): Promise<CreateBookingResult> {
  const phone = normalizePhone(input.phone, input.country as CountryCode);
  if (!phone) throw new DomainError("Проверьте номер телефона", "phone");

  const { visitAt, candidates } = await resolveSelection(
    db,
    input,
    now,
    settings,
  );
  const [clientDiscount, promoCode] = await Promise.all([
    loadClientDiscount(db, phone),
    input.promoCode ? loadPromoCode(db, input.promoCode) : null,
  ]);
  if (input.promoCode && !promoCode) {
    throw new DomainError(PROMO_NOT_FOUND, "promoCode");
  }

  // «Любой мастер»: если время у первого успели занять, пробуем следующего (6.4).
  for (const offer of candidates) {
    const pricing = priceOffer(offer, visitAt, now, {
      clientDiscount,
      promoCode,
    });
    if (
      pricing.totalPrice !== input.expectedTotal ||
      offer.master.id !== input.expectedMasterId ||
      pricing.durationMin !== input.expectedDurationMin
    ) {
      return {
        status: "changed",
        quote: { visitAt, offer, pricing, promoCode, clientDiscount },
      };
    }
    try {
      const created = await insertBooking(db, {
        input,
        phone,
        offer,
        visitAt,
        pricing,
        promoCode,
        now,
      });
      return { status: "created", ...created };
    } catch (error) {
      if (!isBookingOverlapError(error)) throw error;
    }
  }
  throw new DomainError(SLOT_TAKEN);
}

async function insertBooking(
  db: PrismaClient,
  args: {
    input: CreateBookingInput;
    phone: string;
    offer: MasterOffer;
    visitAt: Date;
    pricing: PricingResult;
    promoCode: PromoCodeMatch | null;
    now: Date;
  },
) {
  const { input, phone, offer, visitAt, pricing, now } = args;
  return db.$transaction(async (tx) => {
    // Запросы с одного телефона идут по очереди: иначе два параллельных прошли бы
    // проверку «одна активная запись» и оба записались.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking-phone:${phone}`}))`;

    if (pricing.promoCodeId && args.promoCode?.maxUses != null) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`promo-code:${pricing.promoCodeId}`}))`;
      const uses = await countPromoCodeUses(tx, pricing.promoCodeId);
      if (uses >= args.promoCode.maxUses) {
        throw new DomainError(PROMO_CODE_RAN_OUT, "promoCode");
      }
    }

    const existing = await tx.client.findUnique({
      where: { phone },
      select: { id: true, name: true },
    });
    let clientId: string;
    if (existing) {
      const active = await tx.booking.findFirst({
        where: {
          clientId: existing.id,
          status: { in: ["PENDING", "CONFIRMED"] },
          startsAt: { gt: now },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (active) throw new DomainError(ACTIVE_BOOKING_EXISTS, "phone");
      // Имя, которое знает салон, не перезаписываем тем, что ввели на сайте.
      if (!existing.name.trim()) {
        await tx.client.update({
          where: { id: existing.id },
          data: { name: input.name },
        });
      }
      clientId = existing.id;
    } else {
      const created = await tx.client.create({
        data: { name: input.name, phone },
        select: { id: true },
      });
      clientId = created.id;
    }

    const { token, hash } = createCancelToken();
    const endsAt = addMinutes(visitAt, pricing.durationMin);
    const booking = await tx.booking.create({
      data: {
        clientId,
        masterId: offer.master.id,
        startsAt: visitAt,
        endsAt,
        blockedUntil: addMinutes(endsAt, pricing.bufferMin),
        durationMin: pricing.durationMin,
        bufferMin: pricing.bufferMin,
        status: "PENDING",
        source: "WEBSITE",
        subtotal: pricing.subtotal,
        salonDiscount: pricing.salonDiscount,
        salonDiscountSource: pricing.salonDiscountSource,
        promoCodeId: pricing.promoCodeId,
        totalPrice: pricing.totalPrice,
        clientComment: input.comment || null,
        cancelTokenHash: hash,
        items: {
          create: pricing.items.map((item, index) => ({
            serviceId: item.serviceId,
            serviceName: offer.services[index]?.name ?? "",
            basePrice: item.basePrice,
            masterDiscount: item.masterDiscount,
            price: item.price,
            isPriceManual: item.isPriceManual,
            durationMin: item.durationMin,
            promotionId: item.promotionId,
            sortOrder: index,
          })),
        },
        notifications: { create: { type: "BOOKING_CREATED" } },
      },
      select: { id: true, notifications: { select: { id: true } } },
    });
    const notification = booking.notifications[0];
    if (!notification) throw new Error("Notification was not created");
    return {
      token,
      bookingId: booking.id,
      notificationId: notification.id,
    };
  });
}
