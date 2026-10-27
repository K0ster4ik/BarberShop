import type { DiscountKind } from "@/generated/prisma/enums";
import { roundDiscountUp } from "@/lib/money";

export type Discount = {
  kind: DiscountKind;
  value: number; // PERCENT — 1..100, AMOUNT — копейки
};

/**
 * Сумма скидки в копейках для цены `price`.
 * Округляется до целого рубля в пользу клиента и не превышает саму цену.
 */
export function discountAmount(price: number, discount: Discount): number {
  if (price <= 0) return 0;
  const raw =
    discount.kind === "PERCENT"
      ? (price * discount.value) / 100
      : discount.value;
  return Math.min(roundDiscountUp(raw), price);
}
