import { PROMO_CODE_ISSUE_MESSAGES } from "@/server/pricing/calculate";
import type { BookingQuote } from "./quote";

// Цена для браузера: только то, что клиент видит на шаге подтверждения.

export type QuoteView = {
  master: {
    id: string;
    name: string;
    title: string | null;
    photoPath: string | null;
  };
  visitAt: Date;
  durationMin: number;
  items: {
    name: string;
    basePrice: number;
    masterDiscount: number;
    price: number;
  }[];
  subtotal: number;
  salonDiscount: number;
  salonDiscountLabel: string | null;
  totalPrice: number;
  promoCode: { applied: boolean; message: string } | null;
};

export function toQuoteView(quote: BookingQuote): QuoteView {
  const { offer, pricing, promoCode } = quote;
  const label =
    pricing.salonDiscountSource === "PROMO_CODE"
      ? `Промокод ${promoCode?.code ?? ""}`
      : pricing.salonDiscountSource === "CLIENT"
        ? "Постоянная скидка"
        : pricing.salonDiscountSource === "MANUAL"
          ? "Скидка салона"
          : null;
  return {
    master: offer.master,
    visitAt: quote.visitAt,
    durationMin: pricing.durationMin,
    items: pricing.items.map((item, index) => ({
      name: offer.services[index]?.name ?? "",
      basePrice: item.basePrice,
      masterDiscount: item.masterDiscount,
      price: item.price,
    })),
    subtotal: pricing.subtotal,
    salonDiscount: pricing.salonDiscount,
    salonDiscountLabel: label,
    totalPrice: pricing.totalPrice,
    promoCode: promoCode
      ? pricing.promoCodeId
        ? { applied: true, message: `Промокод ${promoCode.code} применён` }
        : {
            applied: false,
            message:
              PROMO_CODE_ISSUE_MESSAGES[pricing.promoCodeIssue ?? "inactive"],
          }
      : null,
  };
}
