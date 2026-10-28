"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { type CountryCode, normalizePhone } from "@/lib/phone";
import {
  bookingSelectionShape,
  createBookingSchema,
} from "@/lib/validation/booking";
import { type ActionResult, runAction } from "@/server/action-result";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { deliverPendingNotifications } from "@/server/notifications";
import { clientIp, createRateLimiter } from "@/server/rate-limit";
import { cancelBookingByToken } from "./cancel";
import { createWebsiteBooking } from "./create";
import { quoteBooking } from "./quote";
import { type QuoteView, toQuoteView } from "./quote-view";

// Публичные действия сайта: входа нет, поэтому вместо requireRole — лимиты по IP
// и ловушка для ботов (DESIGN.md, раздел 10).

const TEN_MINUTES = 10 * 60_000;
const bookingLimiter = createRateLimiter({ limit: 5, windowMs: TEN_MINUTES });
const quoteLimiter = createRateLimiter({ limit: 60, windowMs: TEN_MINUTES });
const cancelLimiter = createRateLimiter({ limit: 10, windowMs: TEN_MINUTES });

async function enforce(
  limiter: ReturnType<typeof createRateLimiter>,
  message: string,
) {
  if (!limiter.consume(clientIp(await headers())).allowed) {
    throw new DomainError(message);
  }
}

/**
 * Уведомление уходит после ответа клиенту: медленный Telegram не задерживает запись.
 * Только своё — старые неудачные повторяет cron с паузами, а не каждая новая заявка.
 */
function deliverLater(notificationId: string) {
  after(() =>
    deliverPendingNotifications([notificationId]).catch((error: unknown) => {
      console.error("Telegram: ошибка отправки", error);
    }),
  );
}

const quoteRequestSchema = z.object({
  ...bookingSelectionShape,
  country: z.string(),
  phone: z.string(),
  promoCode: z.string().trim().max(40),
});

/** Цена на последнем шаге: с постоянной скидкой клиента и промокодом. */
export async function getBookingQuote(
  input: unknown,
): Promise<ActionResult<QuoteView>> {
  return runAction(async () => {
    await enforce(
      quoteLimiter,
      "Слишком много запросов. Подождите пару минут.",
    );
    const request = quoteRequestSchema.parse(input);
    const phone = request.phone
      ? normalizePhone(request.phone, request.country as CountryCode)
      : null;
    const quote = await quoteBooking(
      db,
      request,
      { phone, promoCode: request.promoCode },
      new Date(),
    );
    return toQuoteView(quote);
  });
}

/**
 * Создаёт запись и уводит на её страницу. Если цена, мастер или длительность изменились
 * с момента, когда клиент их видел, ничего не записывает и возвращает новую сводку.
 */
export async function submitBooking(
  input: unknown,
): Promise<ActionResult<{ changed: QuoteView }>> {
  return runAction(async () => {
    const request = createBookingSchema.parse(input);
    if (request.website) {
      throw new DomainError(
        "Не получилось отправить заявку. Обновите страницу и попробуйте ещё раз.",
      );
    }
    await enforce(
      bookingLimiter,
      "С вашего адреса слишком много заявок. Попробуйте через 10 минут.",
    );
    const result = await createWebsiteBooking(db, request, new Date());
    if (result.status === "changed") {
      return { changed: toQuoteView(result.quote) };
    }
    deliverLater(result.notificationId);
    redirect(`/booking/${result.token}`);
  });
}

export async function cancelMyBooking(token: string): Promise<ActionResult> {
  return runAction(async () => {
    await enforce(
      cancelLimiter,
      "Слишком много попыток. Подождите пару минут.",
    );
    const { notificationId } = await cancelBookingByToken(
      db,
      z.string().max(100).parse(token),
      new Date(),
    );
    deliverLater(notificationId);
    refresh();
    return undefined;
  }, "Запись отменена");
}
