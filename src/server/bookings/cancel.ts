import { salon, type SalonSettings } from "@/config/salon";
import type { PrismaClient } from "@/generated/prisma/client";
import type { BookingStatus } from "@/generated/prisma/enums";
import { addMinutes } from "@/lib/time";
import { DomainError, type Db } from "@/server/errors";
import { hashCancelToken, isCancelToken } from "./token";

// Страница записи по ссылке и отмена клиентом (DESIGN.md, 7.5).

export const BOOKING_NOT_FOUND =
  "Запись не найдена. Возможно, демо-данные уже сбросили — они обновляются каждый час.";

const CANCELLABLE: BookingStatus[] = ["PENDING", "CONFIRMED"];

export async function loadBookingByToken(db: Db, token: string) {
  if (!isCancelToken(token)) return null;
  return db.booking.findFirst({
    where: { cancelTokenHash: hashCancelToken(token), deletedAt: null },
    select: {
      id: true,
      status: true,
      startsAt: true,
      endsAt: true,
      durationMin: true,
      subtotal: true,
      salonDiscount: true,
      salonDiscountSource: true,
      totalPrice: true,
      cancelledBy: true,
      client: { select: { name: true } },
      master: { select: { name: true, title: true, photoPath: true } },
      promoCode: { select: { code: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          serviceName: true,
          basePrice: true,
          masterDiscount: true,
          price: true,
          durationMin: true,
        },
      },
    },
  });
}
export type BookingView = NonNullable<
  Awaited<ReturnType<typeof loadBookingByToken>>
>;

/** Последний момент, когда клиент может отменить запись сам. */
export function cancelDeadline(
  startsAt: Date,
  settings: Pick<SalonSettings, "clientCancelLeadTimeMin"> = salon,
): Date {
  return addMinutes(startsAt, -settings.clientCancelLeadTimeMin);
}

export function canCancel(
  booking: { status: BookingStatus; startsAt: Date },
  now: Date,
  settings: Pick<SalonSettings, "clientCancelLeadTimeMin"> = salon,
): boolean {
  return (
    CANCELLABLE.includes(booking.status) &&
    now < cancelDeadline(booking.startsAt, settings)
  );
}

/**
 * Отменяет запись по токену. Условие проверяется в самом UPDATE: две одновременные
 * отмены не создадут двух уведомлений. Возвращает id уведомления для отправки.
 */
export async function cancelBookingByToken(
  db: PrismaClient,
  token: string,
  now: Date,
  settings: Pick<SalonSettings, "clientCancelLeadTimeMin"> = salon,
): Promise<{ notificationId: string }> {
  const booking = await loadBookingByToken(db, token);
  if (!booking) throw new DomainError(BOOKING_NOT_FOUND);
  if (booking.status === "CANCELLED") {
    throw new DomainError("Запись уже отменена.");
  }
  if (!CANCELLABLE.includes(booking.status)) {
    throw new DomainError("Эту запись уже нельзя отменить.");
  }
  if (!canCancel(booking, now, settings)) {
    throw new DomainError(
      `Отменить запись на сайте можно не позже чем за ${settings.clientCancelLeadTimeMin / 60} ч до начала. Позвоните в салон.`,
    );
  }

  return db.$transaction(async (tx) => {
    const updated = await tx.booking.updateMany({
      where: {
        id: booking.id,
        status: { in: CANCELLABLE },
        startsAt: { gt: addMinutes(now, settings.clientCancelLeadTimeMin) },
      },
      data: { status: "CANCELLED", cancelledAt: now, cancelledBy: "CLIENT" },
    });
    if (updated.count === 0) throw new DomainError("Запись уже отменена.");
    const notification = await tx.notification.create({
      data: { type: "BOOKING_CANCELLED", bookingId: booking.id },
      select: { id: true },
    });
    return { notificationId: notification.id };
  });
}
