"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { idField } from "@/lib/validation/booking";
import { dateField, durationField } from "@/lib/validation/common";
import {
  type BookingUpdateInput,
  bookingUpdateSchema,
  type PaymentInput,
  paymentSchema,
  type StaffBookingInput,
  type StaffQuoteInput,
  type StatusChangeInput,
  staffBookingSchema,
  staffQuoteSchema,
  statusChangeSchema,
} from "@/lib/validation/staff-booking";
import { type ActionResult, runAction } from "@/server/action-result";
import { requireRole } from "@/server/auth";
import { MANAGER_ROLES, SECTION_ROLES } from "@/server/auth/access";
import { db } from "@/server/db";
import { deliverPendingNotifications } from "@/server/notifications";
import * as bookings from "./staff";

// Записи в CRM (DESIGN.md, 7.3–7.6). Роль проверяется до runAction, владение записью
// для MASTER — в сервисе (bookingScope).

const STATUS_MESSAGES = {
  PENDING: "Статус изменён",
  CONFIRMED: "Запись подтверждена",
  COMPLETED: "Отмечено: клиент пришёл",
  CANCELLED: "Запись отменена",
  NO_SHOW: "Отмечено: клиент не пришёл",
} as const;

export async function changeStatus(
  bookingId: string,
  input: StatusChangeInput,
): Promise<ActionResult> {
  const staff = await requireRole(...SECTION_ROLES.bookings);
  return runAction(async () => {
    const data = statusChangeSchema.parse(input);
    const { notificationId } = await bookings.changeBookingStatus(
      db,
      staff,
      idField.parse(bookingId),
      data,
      new Date(),
    );
    // Отмена записи с сайта уходит в канал после ответа сотруднику.
    if (notificationId) {
      after(() => deliverPendingNotifications([notificationId]));
    }
    refresh();
    return undefined;
  }, STATUS_MESSAGES[input.to]);
}

export async function createBooking(
  input: StaffBookingInput,
): Promise<ActionResult<{ id: string }>> {
  const staff = await requireRole(...MANAGER_ROLES);
  return runAction(async () => {
    const data = staffBookingSchema.parse(input);
    return bookings.createStaffBooking(db, staff, data, new Date());
  }, "Запись создана");
}

export async function quoteBooking(
  input: StaffQuoteInput,
): Promise<ActionResult<bookings.StaffQuote>> {
  const staff = await requireRole(...MANAGER_ROLES);
  return runAction(() =>
    bookings.quoteStaffBooking(
      db,
      staff,
      staffQuoteSchema.parse(input),
      new Date(),
    ),
  );
}

export async function updateBooking(
  bookingId: string,
  input: BookingUpdateInput,
): Promise<ActionResult> {
  const staff = await requireRole(...MANAGER_ROLES);
  return runAction(async () => {
    const data = bookingUpdateSchema.parse(input);
    await bookings.updateStaffBooking(
      db,
      staff,
      idField.parse(bookingId),
      data,
      new Date(),
    );
    refresh();
    return undefined;
  }, "Запись сохранена");
}

export async function quoteUpdate(
  bookingId: string,
  input: BookingUpdateInput,
): Promise<ActionResult<bookings.StaffQuote>> {
  const staff = await requireRole(...MANAGER_ROLES);
  return runAction(() =>
    bookings.quoteBookingUpdate(
      db,
      staff,
      idField.parse(bookingId),
      bookingUpdateSchema.parse(input),
      new Date(),
    ),
  );
}

export async function addPayment(
  bookingId: string,
  input: PaymentInput,
): Promise<ActionResult> {
  const staff = await requireRole(...SECTION_ROLES.bookings);
  return runAction(async () => {
    await bookings.addPayment(
      db,
      staff,
      idField.parse(bookingId),
      paymentSchema.parse(input),
      new Date(),
    );
    refresh();
    return undefined;
  }, "Оплата внесена");
}

export async function removePayment(paymentId: string): Promise<ActionResult> {
  const staff = await requireRole(...MANAGER_ROLES);
  return runAction(async () => {
    await bookings.removePayment(db, staff, idField.parse(paymentId));
    refresh();
    return undefined;
  }, "Оплата удалена");
}

export async function deleteBooking(bookingId: string): Promise<ActionResult> {
  const staff = await requireRole(...MANAGER_ROLES);
  return runAction(async () => {
    await bookings.deleteBooking(
      db,
      staff,
      idField.parse(bookingId),
      new Date(),
    );
    return undefined;
  }, "Запись удалена");
}

const freeTimesSchema = z.object({
  masterId: idField,
  date: dateField,
  serviceIds: z.array(idField).max(5).optional(),
  bookingId: idField.optional(),
  durationMin: durationField.nullable().optional(),
});

/** Свободное время мастера на день — подсказки в форме записи и переноса. */
export async function freeTimes(
  input: z.input<typeof freeTimesSchema>,
): Promise<ActionResult<string[]>> {
  const staff = await requireRole(...MANAGER_ROLES);
  return runAction(() =>
    bookings.staffFreeTimes(
      db,
      staff,
      freeTimesSchema.parse(input),
      new Date(),
    ),
  );
}

/** Есть ли клиент с таким телефоном: подставить имя и показать постоянную скидку. */
export async function lookupClient(phone: string): Promise<
  ActionResult<{
    name: string;
    discountKind: "PERCENT" | "AMOUNT" | null;
    discountValue: number | null;
  } | null>
> {
  const staff = await requireRole(...MANAGER_ROLES);
  return runAction(() =>
    bookings.findClientByPhone(db, staff, z.string().max(40).parse(phone)),
  );
}
