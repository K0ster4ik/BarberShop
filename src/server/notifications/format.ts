import type { CancelledBy, NotificationType } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/money";
import { maskPhone } from "@/lib/phone";
import { formatSalonVisit } from "@/lib/time";

// Текст для публичного Telegram-канала (DESIGN.md, раздел 9). Канал видят все, а
// посетители вводят настоящие данные: только имя без фамилии и маскированный телефон.

export type NotificationBooking = {
  clientName: string;
  clientPhone: string; // E.164
  masterName: string;
  startsAt: Date;
  services: string[];
  totalPrice: number;
  cancelledBy: CancelledBy | null;
};

/** HTML для parse_mode=HTML: всё, что ввёл посетитель, экранируется. */
export function formatNotification(
  type: NotificationType,
  booking: NotificationBooking,
): string {
  const title =
    type === "BOOKING_CREATED"
      ? "🆕 <b>Новая запись</b>"
      : `❌ <b>Запись отменена ${booking.cancelledBy === "CLIENT" ? "клиентом" : "салоном"}</b>`;
  const firstName = booking.clientName.trim().split(/\s+/)[0] ?? "";
  return [
    title,
    `${escapeHtml(firstName)}, ${maskPhone(booking.clientPhone)}`,
    escapeHtml(booking.services.join(", ")),
    `Мастер: ${escapeHtml(booking.masterName)}`,
    formatSalonVisit(booking.startsAt),
    `Итого: ${formatMoney(booking.totalPrice)}`,
  ].join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
