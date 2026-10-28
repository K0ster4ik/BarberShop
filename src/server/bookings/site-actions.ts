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

/** Уведомления уходят после ответа клиенту: медленный Telegram не задерживает запись. */
function deliverLater() {
  after(() =>
    deliverPendingNotifications().catch((error: unknown) => {
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
 * Создаёт запись и уводит на её страницу. Если цена изменилась с момента, когда клиент
 * её видел, ничего не записывает и возвращает новую цену на подтверждение.
 */
export async function submitBooking(
  input: unknown,
): Promise<ActionResult<{ priceChanged: QuoteView }>> {
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
    if (result.status === "price_changed") {
      return { priceChanged: toQuoteView(result.quote) };
    }
    deliverLater();
    redirect(`/booking/${result.token}`);
  });
}

export async function cancelMyBooking(token: string): Promise<ActionResult> {
  return runAction(async () => {
    await enforce(
      cancelLimiter,
      "Слишком много попыток. Подождите пару минут.",
    );
    await cancelBookingByToken(
      db,
      z.string().max(100).parse(token),
      new Date(),
    );
    deliverLater();
    refresh();
    return undefined;
  }, "Запись отменена");
}
