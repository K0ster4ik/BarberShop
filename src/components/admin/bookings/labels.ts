import type {
  BookingSource,
  BookingStatus,
  PaymentMethod,
  SalonDiscountSource,
} from "@/generated/prisma/enums";

// Подписи и цвета записей в CRM. Общие для серверных и клиентских компонентов.

export const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: "Ожидает",
  CONFIRMED: "Подтверждена",
  COMPLETED: "Пришёл",
  CANCELLED: "Отменена",
  NO_SHOW: "Не пришёл",
};

/** Подпись кнопки перехода в статус. */
export const STATUS_ACTIONS: Record<BookingStatus, string> = {
  PENDING: "Вернуть в ожидание",
  CONFIRMED: "Подтвердить",
  COMPLETED: "Пришёл",
  CANCELLED: "Отменить",
  NO_SHOW: "Не пришёл",
};

// Цвет статуса: текст на подложке держит контраст в обеих темах.
export const STATUS_BADGE: Record<BookingStatus, string> = {
  PENDING:
    "bg-amber-100 text-amber-950 dark:bg-amber-400/20 dark:text-amber-100",
  CONFIRMED: "bg-sky-100 text-sky-950 dark:bg-sky-400/20 dark:text-sky-100",
  COMPLETED:
    "bg-emerald-100 text-emerald-950 dark:bg-emerald-400/20 dark:text-emerald-100",
  CANCELLED: "bg-muted text-muted-foreground",
  NO_SHOW: "bg-rose-100 text-rose-950 dark:bg-rose-400/20 dark:text-rose-100",
};

/**
 * Плашка записи в расписании: цветная полоска слева и подложка. Подложка непрозрачная
 * (оттенок подмешан к цвету карточки): сквозь неё не видны линии часов и «сейчас».
 */
// Классы записаны целиком: Tailwind находит их по тексту исходников.
export const STATUS_BLOCK: Record<BookingStatus, string> = {
  PENDING:
    "border-l-amber-500 bg-amber-50 hover:bg-amber-100 dark:bg-[color-mix(in_oklch,var(--color-amber-400)_12%,var(--card))] dark:hover:bg-[color-mix(in_oklch,var(--color-amber-400)_22%,var(--card))]",
  CONFIRMED:
    "border-l-sky-500 bg-sky-50 hover:bg-sky-100 dark:bg-[color-mix(in_oklch,var(--color-sky-400)_12%,var(--card))] dark:hover:bg-[color-mix(in_oklch,var(--color-sky-400)_22%,var(--card))]",
  COMPLETED:
    "border-l-emerald-500 bg-emerald-50 hover:bg-emerald-100 dark:bg-[color-mix(in_oklch,var(--color-emerald-400)_12%,var(--card))] dark:hover:bg-[color-mix(in_oklch,var(--color-emerald-400)_22%,var(--card))]",
  CANCELLED: "border-l-border bg-muted",
  NO_SHOW:
    "border-l-rose-400 bg-rose-50 text-muted-foreground hover:bg-rose-100 dark:bg-[color-mix(in_oklch,var(--color-rose-400)_10%,var(--card))] dark:hover:bg-[color-mix(in_oklch,var(--color-rose-400)_20%,var(--card))]",
};

export const SOURCE_LABELS: Record<BookingSource, string> = {
  WEBSITE: "С сайта",
  PHONE: "По телефону",
  WALK_IN: "Пришёл сам",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Наличные",
  CARD: "Карта",
  ONLINE: "Онлайн",
};

export const DISCOUNT_SOURCE_LABELS: Record<SalonDiscountSource, string> = {
  PROMO_CODE: "промокод",
  CLIENT: "постоянная скидка клиента",
  MANUAL: "скидка администратора",
};

/** Оплата состоявшегося визита: null — визит ещё не отмечен. */
export function paymentState(
  status: BookingStatus,
  totalPrice: number,
  paid: number,
): "paid" | "partial" | "unpaid" | null {
  if (status !== "COMPLETED") return null;
  if (paid >= totalPrice) return "paid";
  return paid > 0 ? "partial" : "unpaid";
}

export const PAYMENT_STATE_LABELS = {
  paid: "Оплачено",
  partial: "Оплачено частично",
  unpaid: "Не оплачено",
} as const;
