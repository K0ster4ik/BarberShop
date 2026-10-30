import type { BookingStatus, Role } from "@/generated/prisma/enums";

// Жизненный цикл статуса записи (DESIGN.md, 7.6). Чистые функции: их используют и
// сервисный слой (проверка), и экраны CRM (какие кнопки показать).

/** Статусы, в которых запись ещё можно переносить и менять цену. */
export const EDITABLE_BOOKING_STATUSES: BookingStatus[] = [
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
];

const isManager = (role: Role) => role === "OWNER" || role === "ADMIN";

/** Куда сотрудник с ролью `role` может перевести запись в момент `now`. */
export function nextStatuses(
  booking: { status: BookingStatus; startsAt: Date },
  role: Role,
  now: Date,
): BookingStatus[] {
  // «Пришёл» и «Не пришёл» — только когда визит начался.
  const visit: BookingStatus[] =
    now >= booking.startsAt ? ["COMPLETED", "NO_SHOW"] : [];
  switch (booking.status) {
    case "PENDING":
      return ["CONFIRMED", ...visit, "CANCELLED"];
    case "CONFIRMED":
      return [...visit, "CANCELLED"];
    // Финальные статусы. Ошибку «пришёл» ↔ «не пришёл» исправляет админ.
    case "COMPLETED":
      return isManager(role) ? ["NO_SHOW"] : [];
    case "NO_SHOW":
      return isManager(role) ? ["COMPLETED"] : [];
    case "CANCELLED":
      return [];
  }
}

/** Почему перевод невозможен (текст для сотрудника); null — можно. */
export function statusChangeIssue(
  booking: { status: BookingStatus; startsAt: Date },
  to: BookingStatus,
  role: Role,
  now: Date,
): string | null {
  if (nextStatuses(booking, role, now).includes(to)) return null;
  if (booking.status === to) return "Запись уже в этом статусе.";
  if (booking.status === "CANCELLED") {
    return "Запись отменена — её статус больше не меняется.";
  }
  if (
    (to === "COMPLETED" || to === "NO_SHOW") &&
    (booking.status === "PENDING" || booking.status === "CONFIRMED")
  ) {
    return "Отметить визит можно только после его начала.";
  }
  if (booking.status === "COMPLETED" || booking.status === "NO_SHOW") {
    return isManager(role)
      ? "Визит уже отмечен — статус больше не меняется."
      : "Исправить отметку о визите может администратор.";
  }
  return "Такой переход статуса невозможен.";
}
