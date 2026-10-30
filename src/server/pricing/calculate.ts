import type { SalonSettings } from "@/config/salon";
import type {
  DiscountKind,
  SalonDiscountSource,
} from "@/generated/prisma/enums";
import { isDiscountActive } from "@/server/discount-input";
import { type Discount, discountAmount } from "./discount";

// Цена, скидки и длительность записи (DESIGN.md, раздел 7.3). Чистая функция: данные
// загружает вызывающий, а результат — снимок для Booking и BookingItem. Деньги в копейках.

export type PricedService = {
  serviceId: string;
  basePrice: number; // цена мастера (MasterService.price)
  durationMin: number; // длительность у мастера
  bufferMin: number | null; // уборка после услуги; null — как в настройках салона
  manualPrice?: number | null; // цена, заданная админом вручную
  // Скидка мастера из снимка записи: при правке записи без смены мастера акции заново
  // не подбираются (DESIGN.md, 5.2, инвариант 8).
  keptDiscount?: { amount: number; promotionId: string | null } | null;
};

/** Акция мастера. serviceId: null — на все его услуги. */
export type Promotion = {
  id: string;
  serviceId: string | null;
  kind: DiscountKind;
  value: number;
  isActive: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
};

export type PromoCodeOffer = {
  id: string;
  kind: DiscountKind;
  value: number;
  isActive: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  maxUses: number | null;
  uses: number; // сколько записей уже с этим кодом
};

/** Почему промокод не дал скидку. */
export type PromoCodeIssue =
  | "inactive"
  | "not_started"
  | "expired"
  | "exhausted"
  | "not_better"
  | "manual_discount";

export const PROMO_CODE_ISSUE_MESSAGES: Record<PromoCodeIssue, string> = {
  inactive: "Промокод не действует",
  not_started: "Промокод ещё не начал действовать",
  expired: "Срок действия промокода закончился",
  exhausted: "Промокод больше не действует: лимит использований исчерпан",
  not_better: "Ваша постоянная скидка не меньше — применена она",
  manual_discount: "Скидку задал администратор вручную",
};

export type PricingInput = {
  services: readonly PricedService[];
  promotions: readonly Promotion[]; // акции этого мастера
  visitAt: Date; // акции мастера проверяются на момент визита
  now: Date; // промокод — на момент оформления записи
  promoCode?: PromoCodeOffer | null;
  clientDiscount?: Discount | null; // постоянная скидка клиента
  manualSalonDiscount?: Discount | null; // скидка админа заменяет автоматическую
  settings: Pick<SalonSettings, "defaultBufferMin">;
};

export type PricedItem = {
  serviceId: string;
  basePrice: number;
  masterDiscount: number;
  price: number;
  isPriceManual: boolean;
  promotionId: string | null;
  durationMin: number;
};

export type PricingResult = {
  items: PricedItem[];
  durationMin: number;
  bufferMin: number;
  subtotal: number; // после скидок мастера
  salonDiscount: number;
  salonDiscountSource: SalonDiscountSource | null;
  promoCodeId: string | null;
  promoCodeIssue: PromoCodeIssue | null;
  totalPrice: number;
};

export function calculatePricing(input: PricingInput): PricingResult {
  if (input.services.length === 0) {
    throw new RangeError("A booking needs at least one service");
  }
  // Формы проверяют это раньше; здесь — защита инварианта «итог не меньше нуля».
  for (const service of input.services) {
    assertKopecks(service.basePrice, "basePrice");
    if (service.manualPrice != null) {
      assertKopecks(service.manualPrice, "manualPrice");
    }
    if (service.keptDiscount) {
      assertKopecks(service.keptDiscount.amount, "keptDiscount");
      if (service.keptDiscount.amount > service.basePrice) {
        throw new RangeError("keptDiscount exceeds basePrice");
      }
    }
    if (!Number.isInteger(service.durationMin) || service.durationMin <= 0) {
      throw new RangeError(`Invalid durationMin: ${service.durationMin}`);
    }
    if (
      service.bufferMin !== null &&
      (!Number.isInteger(service.bufferMin) || service.bufferMin < 0)
    ) {
      throw new RangeError(`Invalid bufferMin: ${service.bufferMin}`);
    }
  }
  const items = input.services.map((service) =>
    priceService(service, input.promotions, input.visitAt),
  );
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const salon = salonDiscount(subtotal, input);
  return {
    items,
    durationMin: items.reduce((sum, item) => sum + item.durationMin, 0),
    bufferMin: bookingBufferMin(input.services, input.settings),
    subtotal,
    ...salon,
    totalPrice: subtotal - salon.salonDiscount,
  };
}

function assertKopecks(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `${name} must be a non-negative kopecks amount: ${value}`,
    );
  }
}

/** Уборка после записи — самая долгая из услуг (DESIGN.md, 5.2, инвариант 4). */
export function bookingBufferMin(
  services: readonly Pick<PricedService, "bufferMin">[],
  settings: Pick<SalonSettings, "defaultBufferMin">,
): number {
  return Math.max(
    ...services.map(
      (service) => service.bufferMin ?? settings.defaultBufferMin,
    ),
  );
}

/** Почему промокод нельзя применить в момент `now`; null — можно. */
export function promoCodeIssueAt(
  code: PromoCodeOffer,
  now: Date,
): PromoCodeIssue | null {
  if (!code.isActive) return "inactive";
  if (code.validFrom && now < code.validFrom) return "not_started";
  if (code.validUntil && now >= code.validUntil) return "expired";
  if (code.maxUses !== null && code.uses >= code.maxUses) return "exhausted";
  return null;
}

/** Скидка мастера: самая выгодная из подходящих акций, акции не суммируются. */
function priceService(
  service: PricedService,
  promotions: readonly Promotion[],
  visitAt: Date,
): PricedItem {
  const item = {
    serviceId: service.serviceId,
    basePrice: service.basePrice,
    durationMin: service.durationMin,
  };
  // Цена от админа заменяет расчётную вместе со скидкой и считается ценой мастера.
  if (service.manualPrice != null) {
    return {
      ...item,
      masterDiscount: 0,
      price: service.manualPrice,
      isPriceManual: true,
      promotionId: null,
    };
  }
  if (service.keptDiscount) {
    return {
      ...item,
      masterDiscount: service.keptDiscount.amount,
      price: service.basePrice - service.keptDiscount.amount,
      isPriceManual: false,
      promotionId: service.keptDiscount.promotionId,
    };
  }
  let best = { amount: 0, promotionId: null as string | null };
  for (const promotion of promotions) {
    if (
      promotion.serviceId !== null &&
      promotion.serviceId !== service.serviceId
    )
      continue;
    if (!isDiscountActive(promotion, visitAt)) continue;
    const amount = discountAmount(service.basePrice, promotion);
    if (amount > best.amount) best = { amount, promotionId: promotion.id };
  }
  return {
    ...item,
    masterDiscount: best.amount,
    price: service.basePrice - best.amount,
    isPriceManual: false,
    promotionId: best.promotionId,
  };
}

/**
 * Скидка салона на сумму после скидок мастера. Из промокода и скидки клиента берётся
 * большая; при равенстве остаётся скидка клиента, и промокод не расходуется зря.
 */
function salonDiscount(
  subtotal: number,
  input: PricingInput,
): Pick<
  PricingResult,
  "salonDiscount" | "salonDiscountSource" | "promoCodeId" | "promoCodeIssue"
> {
  if (input.manualSalonDiscount) {
    return {
      salonDiscount: discountAmount(subtotal, input.manualSalonDiscount),
      salonDiscountSource: "MANUAL",
      promoCodeId: null,
      promoCodeIssue: input.promoCode ? "manual_discount" : null,
    };
  }

  let result: ReturnType<typeof salonDiscount> = {
    salonDiscount: 0,
    salonDiscountSource: null,
    promoCodeId: null,
    promoCodeIssue: null,
  };
  if (input.clientDiscount) {
    const amount = discountAmount(subtotal, input.clientDiscount);
    if (amount > 0) {
      result = {
        ...result,
        salonDiscount: amount,
        salonDiscountSource: "CLIENT",
      };
    }
  }
  if (input.promoCode) {
    const issue = promoCodeIssueAt(input.promoCode, input.now);
    const amount = issue ? 0 : discountAmount(subtotal, input.promoCode);
    if (issue) {
      result = { ...result, promoCodeIssue: issue };
    } else if (amount > result.salonDiscount) {
      result = {
        salonDiscount: amount,
        salonDiscountSource: "PROMO_CODE",
        promoCodeId: input.promoCode.id,
        promoCodeIssue: null,
      };
    } else {
      result = { ...result, promoCodeIssue: "not_better" };
    }
  }
  return result;
}
