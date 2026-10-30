import { salon, type SalonSettings } from "@/config/salon";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { SalonDiscountSource } from "@/generated/prisma/enums";
import { formatMoney, rublesToKopecks } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import {
  addMinutes,
  type DateString,
  minutesToTime,
  salonTimeToInstant,
  timeToMinutes,
  toSalonMinutes,
} from "@/lib/time";
import type {
  BookingUpdateInput,
  PaymentInput,
  SalonDiscountInput,
  StaffBookingInput,
  StaffQuoteInput,
  StatusChangeInput,
} from "@/lib/validation/staff-booking";
import {
  bookingScope,
  ForbiddenError,
  type StaffUser,
} from "@/server/auth/access";
import { DomainError, type Db } from "@/server/errors";
import {
  calculatePricing,
  PROMO_CODE_ISSUE_MESSAGES,
  type PricedService,
  type PricingResult,
  type PromoCodeIssue,
  type PromoCodeOffer,
} from "@/server/pricing/calculate";
import type { Discount } from "@/server/pricing/discount";
import { fitsSchedule } from "@/server/slots/fit";
import { loadMasterDays } from "@/server/slots/load";
import { loadAvailability } from "./availability";
import { isBookingOverlapError } from "./errors";
import { EDITABLE_BOOKING_STATUSES, statusChangeIssue } from "./lifecycle";
import { loadOffers, type MasterOffer } from "./offer";
import {
  countPromoCodeUses,
  loadClientDiscount,
  loadPromoCode,
  PROMO_NOT_FOUND,
} from "./quote";

// Записи в CRM (DESIGN.md, 7.3–7.6): ручная запись, перенос, ручные цены и скидки,
// статусы, оплаты, удаление. Права проверяются здесь, а не только в UI: MASTER видит
// и меняет только свои записи (bookingScope в where), правки и удаление — OWNER и ADMIN.

export const STAFF_BOOKING_NOT_FOUND =
  "Запись не найдена: возможно, её удалили.";
export const MASTER_BUSY =
  "У мастера в это время уже есть запись. Выберите другое время.";
export const BOOKING_CHANGED =
  "Запись только что изменил кто-то другой. Обновите страницу и повторите.";
export const PAYMENT_NEEDS_VISIT =
  "Оплату вносят за состоявшийся визит. Сначала отметьте, что клиент пришёл.";

function assertManager(staff: StaffUser): void {
  if (staff.role !== "OWNER" && staff.role !== "ADMIN") {
    throw new ForbiddenError();
  }
}

// Промокод в CRM видит сотрудник, а не клиент: подписи без «ваша».
const STAFF_PROMO_MESSAGES: Record<PromoCodeIssue, string> = {
  ...PROMO_CODE_ISSUE_MESSAGES,
  not_better: "Постоянная скидка клиента не меньше — применена она",
  manual_discount: "Задана ручная скидка — промокод не применяется",
};

function manualPrice(rubles: number | null | undefined): number | null {
  return rubles == null ? null : rublesToKopecks(rubles);
}

function manualDiscount(input: SalonDiscountInput): Discount | null {
  if (input.mode !== "manual" || input.value === null) return null;
  return {
    kind: input.kind,
    value:
      input.kind === "PERCENT" ? input.value : rublesToKopecks(input.value),
  };
}

function visitInstant(date: DateString, time: string): Date {
  return salonTimeToInstant(date, timeToMinutes(time) ?? Number.NaN);
}

/** Сводка цены для формы: что получится, если сохранить. */
export type StaffQuote = {
  items: {
    key: string; // serviceId у новой записи, BookingItem.id у существующей
    name: string;
    basePrice: number;
    masterDiscount: number;
    price: number;
    isPriceManual: boolean;
    durationMin: number;
  }[];
  subtotal: number;
  salonDiscount: number;
  salonDiscountSource: SalonDiscountSource | null;
  totalPrice: number;
  durationMin: number;
  servicesDurationMin: number; // по услугам — подсказка для ручной длительности
  promoCodeIssue: string | null;
  fitsSchedule: boolean; // false — вне графика или на отсутствии: можно, но с предупреждением
  overlaps: boolean; // пересекается с другой записью мастера: сохранить не получится
};

function toQuote(
  pricing: PricingResult,
  items: { key: string; name: string }[],
  durationMin: number,
  check: { fitsSchedule: boolean; overlaps: boolean },
): StaffQuote {
  return {
    items: pricing.items.map((item, index) => ({
      key: items[index]?.key ?? item.serviceId,
      name: items[index]?.name ?? "",
      basePrice: item.basePrice,
      masterDiscount: item.masterDiscount,
      price: item.price,
      isPriceManual: item.isPriceManual,
      durationMin: item.durationMin,
    })),
    subtotal: pricing.subtotal,
    salonDiscount: pricing.salonDiscount,
    salonDiscountSource: pricing.salonDiscountSource,
    totalPrice: pricing.totalPrice,
    durationMin,
    servicesDurationMin: pricing.durationMin,
    promoCodeIssue: pricing.promoCodeIssue
      ? STAFF_PROMO_MESSAGES[pricing.promoCodeIssue]
      : null,
    ...check,
  };
}

/**
 * Предупреждения для формы: вне графика (записать можно) и пересечение с другой записью
 * мастера (сохранить не даст constraint). Переносимая запись сама себе не мешает.
 */
async function checkSchedule(
  db: Db,
  visit: {
    masterId: string;
    date: DateString;
    start: Date;
    durationMin: number;
    bufferMin: number;
    bookingId?: string;
  },
): Promise<{ fitsSchedule: boolean; overlaps: boolean }> {
  const [day] = await loadMasterDays(
    db,
    [visit.masterId],
    visit.date,
    undefined,
    visit.bookingId,
  );
  if (!day) return { fitsSchedule: false, overlaps: false };
  const blockedUntil = addMinutes(
    visit.start,
    visit.durationMin + visit.bufferMin,
  );
  return {
    fitsSchedule: fitsSchedule({
      date: visit.date,
      start: visit.start,
      durationMin: visit.durationMin,
      workingHours: day.workingHours,
      timeOffs: day.timeOffs,
    }),
    overlaps: day.bookings.some(
      (other) => other.start < blockedUntil && visit.start < other.end,
    ),
  };
}

// ── Ручная запись ────────────────────────────────────────────────────────────

async function priceNewBooking(
  db: Db,
  input: StaffQuoteInput,
  now: Date,
  settings: SalonSettings,
) {
  const phone = normalizePhone(input.phone);
  const offer = (await loadOffers(db, input.serviceIds, settings)).find(
    (row) => row.master.id === input.masterId,
  );
  if (!offer) {
    throw new DomainError(
      "Мастер не делает все выбранные услуги",
      "serviceIds",
    );
  }
  const visitAt = visitInstant(input.date, input.time);
  const auto = input.discount.mode === "auto";
  const [clientDiscount, promoCode] = await Promise.all([
    auto ? loadClientDiscount(db, phone) : null,
    auto && input.promoCode ? loadPromoCode(db, input.promoCode) : null,
  ]);
  if (auto && input.promoCode && !promoCode) {
    throw new DomainError(PROMO_NOT_FOUND, "promoCode");
  }
  const pricing = calculatePricing({
    services: offer.services.map((service) => ({
      ...service,
      manualPrice: manualPrice(input.prices[service.serviceId]),
    })),
    promotions: offer.promotions,
    visitAt,
    now,
    clientDiscount,
    promoCode,
    manualSalonDiscount: manualDiscount(input.discount),
    settings,
  });
  return {
    phone,
    offer,
    visitAt,
    pricing,
    promoCode,
    durationMin: input.durationMin ?? pricing.durationMin,
  };
}

export async function quoteStaffBooking(
  db: Db,
  staff: StaffUser,
  input: StaffQuoteInput,
  now: Date,
  settings: SalonSettings = salon,
): Promise<StaffQuote> {
  assertManager(staff);
  const priced = await priceNewBooking(db, input, now, settings);
  const check = await checkSchedule(db, {
    masterId: input.masterId,
    date: input.date,
    start: priced.visitAt,
    durationMin: priced.durationMin,
    bufferMin: priced.pricing.bufferMin,
  });
  return toQuote(
    priced.pricing,
    priced.offer.services.map((service) => ({
      key: service.serviceId,
      name: service.name,
    })),
    priced.durationMin,
    check,
  );
}

/**
 * Запись по телефону или «пришёл сам». Создаётся подтверждённой, в канал не уходит
 * (DESIGN.md, 9). Ограничения «одна активная запись на телефон» здесь нет (7.2).
 * Время вне графика допустимо, пересечения с другими записями ловит constraint.
 */
export async function createStaffBooking(
  db: PrismaClient,
  staff: StaffUser,
  input: StaffBookingInput,
  now: Date,
  settings: SalonSettings = salon,
): Promise<{ id: string }> {
  assertManager(staff);
  const { phone, offer, visitAt, pricing, promoCode, durationMin } =
    await priceNewBooking(db, input, now, settings);
  if (!phone) throw new DomainError("Проверьте номер телефона", "phone");
  // Код, который не сработал, не должен молча пропасть: админ решит, что делать.
  if (pricing.promoCodeIssue && pricing.promoCodeIssue !== "not_better") {
    throw new DomainError(
      STAFF_PROMO_MESSAGES[pricing.promoCodeIssue],
      "promoCode",
    );
  }
  const endsAt = addMinutes(visitAt, durationMin);

  try {
    return await db.$transaction(async (tx) => {
      if (pricing.promoCodeId && promoCode?.maxUses != null) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`promo-code:${pricing.promoCodeId}`}))`;
        const uses = await countPromoCodeUses(tx, pricing.promoCodeId);
        if (uses >= promoCode.maxUses) {
          throw new DomainError(STAFF_PROMO_MESSAGES.exhausted, "promoCode");
        }
      }
      // Имя, которое салон уже знает, не перезаписываем: карточку клиента правят в CRM.
      const client = await tx.client.upsert({
        where: { phone },
        create: { phone, name: input.name },
        update: {},
        select: { id: true, name: true },
      });
      if (!client.name.trim()) {
        await tx.client.update({
          where: { id: client.id },
          data: { name: input.name },
        });
      }
      return tx.booking.create({
        data: {
          clientId: client.id,
          masterId: offer.master.id,
          startsAt: visitAt,
          endsAt,
          blockedUntil: addMinutes(endsAt, pricing.bufferMin),
          durationMin,
          isDurationManual: input.durationMin !== null,
          bufferMin: pricing.bufferMin,
          status: "CONFIRMED",
          confirmedAt: now,
          source: input.source,
          subtotal: pricing.subtotal,
          salonDiscount: pricing.salonDiscount,
          salonDiscountSource: pricing.salonDiscountSource,
          promoCodeId: pricing.promoCodeId,
          totalPrice: pricing.totalPrice,
          clientComment: input.comment || null,
          createdById: staff.id,
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
        },
        select: { id: true },
      });
    });
  } catch (error) {
    if (isBookingOverlapError(error))
      throw new DomainError(MASTER_BUSY, "time");
    throw error;
  }
}

// ── Перенос, длительность, ручные цены и скидка ──────────────────────────────

async function loadForUpdate(db: Db, staff: StaffUser, id: string) {
  const booking = await db.booking.findFirst({
    where: { id, deletedAt: null, ...bookingScope(staff) },
    select: {
      id: true,
      masterId: true,
      status: true,
      bufferMin: true,
      updatedAt: true,
      client: { select: { discountKind: true, discountValue: true } },
      promoCode: { select: { id: true, kind: true, value: true } },
      payments: { select: { amount: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          serviceId: true,
          serviceName: true,
          basePrice: true,
          masterDiscount: true,
          promotionId: true,
          durationMin: true,
        },
      },
    },
  });
  if (!booking) throw new DomainError(STAFF_BOOKING_NOT_FOUND);
  if (!EDITABLE_BOOKING_STATUSES.includes(booking.status)) {
    throw new DomainError(
      "Отменённую запись и неявку не переносят и не меняют.",
    );
  }
  return booking;
}
type BookingForUpdate = Awaited<ReturnType<typeof loadForUpdate>>;

/**
 * Цена после правки. Без смены мастера цены услуг остаются из снимка записи — прайс
 * и акции, изменившиеся после записи, её не трогают (5.2, инвариант 8). Новый мастер —
 * его прайс и акции на момент визита (7.4). Цены, заданные вручную, остаются.
 */
async function priceUpdate(
  db: Db,
  booking: BookingForUpdate,
  input: BookingUpdateInput,
  now: Date,
  settings: SalonSettings,
) {
  const visitAt = visitInstant(input.date, input.time);
  const masterChanged = input.masterId !== booking.masterId;
  let ownPrices: Map<string, { price: number; durationMin: number }> | null =
    null;
  let promotions: Parameters<typeof calculatePricing>[0]["promotions"] = [];
  if (masterChanged) {
    const master = await db.master.findFirst({
      where: { id: input.masterId, isActive: true },
      select: {
        services: {
          where: { serviceId: { in: booking.items.map((i) => i.serviceId) } },
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
    if (!master) {
      throw new DomainError("Мастер не найден или отключён", "masterId");
    }
    ownPrices = new Map(master.services.map((row) => [row.serviceId, row]));
    const missing = booking.items.find(
      (item) => !ownPrices?.has(item.serviceId),
    );
    if (missing) {
      throw new DomainError(
        `Мастер не делает услугу «${missing.serviceName}»`,
        "masterId",
      );
    }
    promotions = master.promotions;
  }

  const services: PricedService[] = booking.items.map((item) => {
    const own = ownPrices?.get(item.serviceId);
    return {
      serviceId: item.serviceId,
      basePrice: own?.price ?? item.basePrice,
      durationMin: own?.durationMin ?? item.durationMin,
      bufferMin: null, // уборка записи не зависит от мастера и остаётся прежней
      manualPrice: manualPrice(input.prices[item.id]),
      keptDiscount: own
        ? null
        : { amount: item.masterDiscount, promotionId: item.promotionId },
    };
  });

  const auto = input.discount.mode === "auto";
  const { client, promoCode } = booking;
  // Промокод уже принят при записи: его срок и лимит заново не проверяются.
  const acceptedCode: PromoCodeOffer | null =
    auto && promoCode
      ? {
          ...promoCode,
          isActive: true,
          validFrom: null,
          validUntil: null,
          maxUses: null,
          uses: 0,
        }
      : null;
  const pricing = calculatePricing({
    services,
    promotions,
    visitAt,
    now,
    clientDiscount:
      auto && client.discountKind && client.discountValue
        ? { kind: client.discountKind, value: client.discountValue }
        : null,
    promoCode: acceptedCode,
    manualSalonDiscount: manualDiscount(input.discount),
    settings,
  });
  return {
    visitAt,
    pricing,
    durationMin: input.durationMin ?? pricing.durationMin,
  };
}

export async function quoteBookingUpdate(
  db: Db,
  staff: StaffUser,
  id: string,
  input: BookingUpdateInput,
  now: Date,
  settings: SalonSettings = salon,
): Promise<StaffQuote> {
  assertManager(staff);
  const booking = await loadForUpdate(db, staff, id);
  const { visitAt, pricing, durationMin } = await priceUpdate(
    db,
    booking,
    input,
    now,
    settings,
  );
  const check = await checkSchedule(db, {
    masterId: input.masterId,
    date: input.date,
    start: visitAt,
    durationMin,
    bufferMin: booking.bufferMin,
    bookingId: booking.id,
  });
  return toQuote(
    pricing,
    booking.items.map((item) => ({ key: item.id, name: item.serviceName })),
    durationMin,
    check,
  );
}

/**
 * Блокирует строку записи до конца транзакции. Всё, что проверяется после неё (статус,
 * мастер, итог, оплаты), не изменится параллельно: перенос, смена статуса и оплата
 * одной записи идут по очереди, а не проскакивают между проверкой и UPDATE.
 */
async function lockBooking(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${id} FOR UPDATE`;
}

async function paidSum(tx: Prisma.TransactionClient, bookingId: string) {
  const paid = await tx.payment.aggregate({
    where: { bookingId },
    _sum: { amount: true },
  });
  return paid._sum.amount ?? 0;
}

/**
 * Перенос, смена мастера, длительность, ручные цены и скидка. Статус сохраняется.
 * `version` — updatedAt записи, с которой открыли форму: правка поверх чужой (перенос,
 * смена статуса) не пройдёт, сотрудник увидит просьбу обновить страницу.
 */
export async function updateStaffBooking(
  db: PrismaClient,
  staff: StaffUser,
  id: string,
  version: Date,
  input: BookingUpdateInput,
  now: Date,
  settings: SalonSettings = salon,
): Promise<void> {
  assertManager(staff);
  const booking = await loadForUpdate(db, staff, id);
  if (booking.updatedAt.getTime() !== version.getTime()) {
    throw new DomainError(BOOKING_CHANGED);
  }
  const { visitAt, pricing, durationMin } = await priceUpdate(
    db,
    booking,
    input,
    now,
    settings,
  );
  const endsAt = addMinutes(visitAt, durationMin);

  try {
    await db.$transaction(async (tx) => {
      await lockBooking(tx, id);
      // Цена посчитана по прочитанной версии: если запись успели изменить — отказ.
      const current = await tx.booking.findFirst({
        where: {
          id,
          updatedAt: version,
          deletedAt: null,
          status: { in: EDITABLE_BOOKING_STATUSES },
        },
        select: { id: true },
      });
      if (!current) throw new DomainError(BOOKING_CHANGED);
      // Оплата не меняет updatedAt — сумму оплат проверяем под блокировкой.
      const paid = await paidSum(tx, id);
      if (paid > pricing.totalPrice) {
        throw new DomainError(
          `По записи уже оплачено ${formatMoney(paid)} — больше нового итога. Сначала удалите лишнюю оплату.`,
        );
      }
      await tx.booking.update({
        where: { id },
        data: {
          masterId: input.masterId,
          startsAt: visitAt,
          endsAt,
          blockedUntil: addMinutes(endsAt, booking.bufferMin),
          durationMin,
          isDurationManual: input.durationMin !== null,
          subtotal: pricing.subtotal,
          salonDiscount: pricing.salonDiscount,
          salonDiscountSource: pricing.salonDiscountSource,
          promoCodeId: pricing.promoCodeId,
          totalPrice: pricing.totalPrice,
        },
      });
      for (const [index, item] of pricing.items.entries()) {
        const row = booking.items[index];
        if (!row) throw new Error("Booking items changed during update");
        await tx.bookingItem.update({
          where: { id: row.id },
          data: {
            basePrice: item.basePrice,
            masterDiscount: item.masterDiscount,
            price: item.price,
            isPriceManual: item.isPriceManual,
            durationMin: item.durationMin,
            promotionId: item.promotionId,
          },
        });
      }
    });
  } catch (error) {
    if (isBookingOverlapError(error))
      throw new DomainError(MASTER_BUSY, "time");
    throw error;
  }
}

// ── Статусы ──────────────────────────────────────────────────────────────────

/**
 * Смена статуса (7.6). MASTER — только своих записей. Отмена записи с сайта уходит
 * в канал (раздел 9): возвращается id уведомления для отправки после ответа.
 */
export async function changeBookingStatus(
  db: PrismaClient,
  staff: StaffUser,
  id: string,
  input: StatusChangeInput,
  now: Date,
): Promise<{ notificationId: string | null }> {
  const { to, payment } = input;
  if (payment && to !== "COMPLETED") {
    throw new DomainError("Оплату вносят вместе с отметкой «Пришёл».");
  }
  const amount = payment ? rublesToKopecks(payment.amount) : 0;

  try {
    return await db.$transaction(async (tx) => {
      await lockBooking(tx, id);
      // Права и правила — по заблокированной строке: если запись успели передать
      // другому мастеру или перенести, решение принимается по новым данным.
      const booking = await tx.booking.findFirst({
        where: { id, deletedAt: null, ...bookingScope(staff) },
        select: {
          status: true,
          startsAt: true,
          source: true,
          totalPrice: true,
        },
      });
      if (!booking) throw new DomainError(STAFF_BOOKING_NOT_FOUND);
      const issue = statusChangeIssue(booking, to, staff.role, now);
      if (issue) throw new DomainError(issue);
      const paid = await paidSum(tx, id);
      if (to === "NO_SHOW" && paid > 0) {
        throw new DomainError(
          "По записи есть оплата. Сначала удалите её, потом отмечайте неявку.",
        );
      }
      if (payment && amount > booking.totalPrice - paid) {
        throw new DomainError(
          `Сумма больше остатка к оплате (${formatMoney(booking.totalPrice - paid)})`,
          "payment.amount",
        );
      }
      await tx.booking.update({
        where: { id },
        data: {
          status: to,
          ...(to === "CONFIRMED" && { confirmedAt: now }),
          ...(to === "CANCELLED" && {
            cancelledAt: now,
            cancelledBy: "STAFF" as const,
          }),
        },
      });
      if (payment) {
        await tx.payment.create({
          data: { bookingId: id, amount, method: payment.method, paidAt: now },
        });
      }
      if (to === "CANCELLED" && booking.source === "WEBSITE") {
        const notification = await tx.notification.create({
          data: { type: "BOOKING_CANCELLED", bookingId: id },
          select: { id: true },
        });
        return { notificationId: notification.id };
      }
      return { notificationId: null };
    });
  } catch (error) {
    // «Не пришёл» → «Пришёл»: за это время слот мог занять кто-то другой.
    if (isBookingOverlapError(error)) {
      throw new DomainError(
        "Время этой записи уже занято другой записью мастера.",
      );
    }
    throw error;
  }
}

// ── Оплаты и удаление ────────────────────────────────────────────────────────

/** Оплата визита: MASTER — по своим записям. Сумма оплат не больше итога записи. */
export async function addPayment(
  db: PrismaClient,
  staff: StaffUser,
  bookingId: string,
  input: PaymentInput,
  now: Date,
): Promise<void> {
  const amount = rublesToKopecks(input.amount);
  await db.$transaction(async (tx) => {
    // Под блокировкой: две оплаты одновременно не превысят итог, а правка цены
    // не проскочит между проверкой остатка и записью оплаты.
    await lockBooking(tx, bookingId);
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, deletedAt: null, ...bookingScope(staff) },
      select: { status: true, totalPrice: true },
    });
    if (!booking) throw new DomainError(STAFF_BOOKING_NOT_FOUND);
    if (booking.status !== "COMPLETED") {
      throw new DomainError(PAYMENT_NEEDS_VISIT);
    }
    const left = booking.totalPrice - (await paidSum(tx, bookingId));
    if (amount > left) {
      throw new DomainError(
        left > 0
          ? `Осталось оплатить ${formatMoney(left)} — сумма больше`
          : "Запись уже оплачена полностью",
        "amount",
      );
    }
    await tx.payment.create({
      data: { bookingId, amount, method: input.method, paidAt: now },
    });
  });
}

/** Удалить ошибочную оплату — OWNER и ADMIN. */
export async function removePayment(
  db: Db,
  staff: StaffUser,
  paymentId: string,
): Promise<void> {
  assertManager(staff);
  const deleted = await db.payment.deleteMany({
    where: { id: paymentId, booking: { deletedAt: null } },
  });
  if (deleted.count === 0) throw new DomainError("Оплата не найдена.");
}

/**
 * Мягкое удаление ошибочной записи (7.6): пропадает из интерфейса и аналитики,
 * освобождает время. Только OWNER и ADMIN.
 */
export async function deleteBooking(
  db: Db,
  staff: StaffUser,
  id: string,
  now: Date,
): Promise<void> {
  assertManager(staff);
  const deleted = await db.booking.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: now },
  });
  if (deleted.count === 0) throw new DomainError(STAFF_BOOKING_NOT_FOUND);
}

// ── Подсказки для форм ───────────────────────────────────────────────────────

// Персонал записывает и на ближайшие минуты, и дальше горизонта сайта.
const STAFF_SLOT_SETTINGS: SalonSettings = {
  ...salon,
  minLeadTimeMin: 0,
  bookingHorizonDays: 366,
};

/**
 * Свободное время мастера на день — подсказки в форме. Для переноса передаётся
 * `bookingId`: услуги берутся из записи, а сама запись время не занимает.
 */
export async function staffFreeTimes(
  db: Db,
  staff: StaffUser,
  args: {
    masterId: string;
    date: DateString;
    serviceIds?: string[];
    bookingId?: string;
    durationMin?: number | null;
  },
  now: Date,
): Promise<string[]> {
  assertManager(staff);
  let serviceIds = args.serviceIds ?? [];
  if (args.bookingId) {
    const items = await db.bookingItem.findMany({
      where: { bookingId: args.bookingId },
      orderBy: { sortOrder: "asc" },
      select: { serviceId: true },
    });
    serviceIds = items.map((item) => item.serviceId);
  }
  if (serviceIds.length === 0) return [];

  let offer: MasterOffer | undefined;
  try {
    offer = (await loadOffers(db, serviceIds)).find(
      (row) => row.master.id === args.masterId,
    );
  } catch (error) {
    if (error instanceof DomainError) return []; // услугу успели скрыть
    throw error;
  }
  if (!offer) return [];
  const sized = args.durationMin
    ? { ...offer, durationMin: args.durationMin }
    : offer;
  const slots = await loadAvailability(
    db,
    [sized],
    [args.date],
    now,
    STAFF_SLOT_SETTINGS,
    args.bookingId,
  );
  return (slots.get(args.date) ?? []).map((slot) =>
    minutesToTime(toSalonMinutes(slot.start)),
  );
}

/** Клиент по телефону для формы записи: имя и постоянная скидка. */
export async function findClientByPhone(
  db: Db,
  staff: StaffUser,
  rawPhone: string,
) {
  assertManager(staff);
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  return db.client.findUnique({
    where: { phone },
    select: { name: true, discountKind: true, discountValue: true },
  });
}
