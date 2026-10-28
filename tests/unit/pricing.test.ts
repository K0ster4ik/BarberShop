import { describe, expect, it } from "vitest";
import { salon } from "@/config/salon";
import {
  calculatePricing,
  type PricingInput,
  type PromoCodeOffer,
  type Promotion,
} from "@/server/pricing/calculate";

const VISIT = new Date("2026-11-10T08:00:00Z");
const NOW = new Date("2026-11-03T12:00:00Z");

const haircut = {
  serviceId: "haircut",
  basePrice: 185_000,
  durationMin: 60,
  bufferMin: null,
};
const beard = {
  serviceId: "beard",
  basePrice: 100_000,
  durationMin: 30,
  bufferMin: 15,
};

function promotion(overrides: Partial<Promotion>): Promotion {
  return {
    id: "promo",
    serviceId: null,
    kind: "PERCENT",
    value: 10,
    isActive: true,
    validFrom: null,
    validUntil: null,
    ...overrides,
  };
}

function promoCode(overrides: Partial<PromoCodeOffer> = {}): PromoCodeOffer {
  return {
    id: "code",
    kind: "PERCENT",
    value: 15,
    isActive: true,
    validFrom: null,
    validUntil: null,
    maxUses: null,
    uses: 0,
    ...overrides,
  };
}

function price(input: Partial<PricingInput>) {
  return calculatePricing({
    services: [haircut, beard],
    promotions: [],
    visitAt: VISIT,
    now: NOW,
    settings: salon,
    ...input,
  });
}

describe("calculatePricing: services", () => {
  it("adds up prices and durations and takes the longest buffer", () => {
    const result = price({});
    expect(result.subtotal).toBe(285_000);
    expect(result.totalPrice).toBe(285_000);
    expect(result.durationMin).toBe(90);
    // У стрижки свой буфер не задан (10 по салону), у бороды — 15
    expect(result.bufferMin).toBe(15);
    expect(result.salonDiscountSource).toBeNull();
  });

  it("uses the salon buffer when no service sets its own", () => {
    expect(price({ services: [haircut] }).bufferMin).toBe(
      salon.defaultBufferMin,
    );
  });

  it("refuses a booking without services", () => {
    expect(() => price({ services: [] })).toThrow(RangeError);
  });

  it("refuses impossible amounts instead of producing a negative total", () => {
    for (const service of [
      { ...haircut, manualPrice: -5_000 },
      { ...haircut, basePrice: -1 },
      { ...haircut, basePrice: 100.5 }, // копейки — только целые
      { ...haircut, durationMin: 0 },
      { ...haircut, bufferMin: -5 },
    ]) {
      expect(() => price({ services: [service] })).toThrow(RangeError);
    }
  });
});

describe("calculatePricing: master discount", () => {
  it("applies a service promotion to that service only", () => {
    const result = price({
      promotions: [promotion({ id: "p1", serviceId: "beard", value: 20 })],
    });
    expect(result.items).toMatchObject([
      { serviceId: "haircut", masterDiscount: 0, price: 185_000 },
      {
        serviceId: "beard",
        masterDiscount: 20_000,
        price: 80_000,
        promotionId: "p1",
      },
    ]);
    expect(result.subtotal).toBe(265_000);
  });

  it("picks the best promotion for each service without adding them up", () => {
    const result = price({
      services: [haircut],
      promotions: [
        promotion({ id: "all", value: 10 }), // 185 ₽
        promotion({ id: "amount", kind: "AMOUNT", value: 30_000 }), // 300 ₽
        promotion({ id: "small", serviceId: "haircut", value: 5 }),
      ],
    });
    expect(result.items[0]).toMatchObject({
      masterDiscount: 30_000,
      promotionId: "amount",
    });
  });

  it("rounds the discount up to a whole ruble in the client's favour", () => {
    // 15% от 1 850 ₽ = 277,50 ₽ → 278 ₽
    const result = price({
      services: [haircut],
      promotions: [promotion({ value: 15 })],
    });
    expect(result.items[0]?.masterDiscount).toBe(27_800);
  });

  it("checks the promotion period at the visit time, end excluded", () => {
    const window = { validFrom: VISIT, validUntil: new Date("2026-11-11") };
    expect(
      price({ promotions: [promotion(window)] }).items[0]?.masterDiscount,
    ).toBe(18_500);
    expect(
      price({ promotions: [promotion({ validFrom: new Date("2026-11-11") })] })
        .items[0]?.masterDiscount,
    ).toBe(0);
    expect(
      price({ promotions: [promotion({ validUntil: VISIT })] }).items[0]
        ?.masterDiscount,
    ).toBe(0);
  });

  it("ignores a switched-off promotion", () => {
    expect(
      price({ promotions: [promotion({ isActive: false })] }).subtotal,
    ).toBe(285_000);
  });

  it("lets an admin's price replace the calculated one", () => {
    const result = price({
      services: [{ ...haircut, manualPrice: 150_000 }],
      promotions: [promotion({ value: 50 })],
    });
    expect(result.items[0]).toEqual({
      serviceId: "haircut",
      basePrice: 185_000,
      masterDiscount: 0,
      price: 150_000,
      isPriceManual: true,
      promotionId: null,
      durationMin: 60,
    });
  });
});

describe("calculatePricing: salon discount", () => {
  it("applies the salon discount after master discounts", () => {
    const result = price({
      promotions: [promotion({ serviceId: "beard", value: 20 })],
      clientDiscount: { kind: "PERCENT", value: 10 },
    });
    // Σ после скидки мастера 2 650 ₽, 10% = 265 ₽
    expect(result).toMatchObject({
      subtotal: 265_000,
      salonDiscount: 26_500,
      salonDiscountSource: "CLIENT",
      totalPrice: 238_500,
    });
  });

  it("takes the bigger of the promo code and the client discount", () => {
    const result = price({
      clientDiscount: { kind: "PERCENT", value: 10 },
      promoCode: promoCode({ value: 15 }),
    });
    expect(result).toMatchObject({
      salonDiscount: 42_800, // 15% от 2 850 ₽ = 427,50 → 428 ₽
      salonDiscountSource: "PROMO_CODE",
      promoCodeId: "code",
      promoCodeIssue: null,
    });
  });

  it("keeps the client discount when the code gives no more", () => {
    for (const value of [10, 5]) {
      const result = price({
        clientDiscount: { kind: "PERCENT", value: 10 },
        promoCode: promoCode({ value }),
      });
      expect(result).toMatchObject({
        salonDiscountSource: "CLIENT",
        promoCodeId: null,
        promoCodeIssue: "not_better",
      });
    }
  });

  it("checks the promo code at the moment of booking, not of the visit", () => {
    // Код действует до завтра, а визит через неделю — скидка есть
    const tomorrow = new Date("2026-11-04T00:00:00Z");
    expect(
      price({ promoCode: promoCode({ validUntil: tomorrow }) }).promoCodeId,
    ).toBe("code");
  });

  it("explains why a promo code was not applied", () => {
    const cases = [
      [promoCode({ isActive: false }), "inactive"],
      [promoCode({ validFrom: new Date("2026-11-04") }), "not_started"],
      [promoCode({ validUntil: NOW }), "expired"],
      [promoCode({ maxUses: 100, uses: 100 }), "exhausted"],
    ] as const;
    for (const [code, issue] of cases) {
      expect(price({ promoCode: code })).toMatchObject({
        salonDiscount: 0,
        promoCodeId: null,
        promoCodeIssue: issue,
      });
    }
  });

  it("lets a manual discount replace the automatic one", () => {
    const result = price({
      clientDiscount: { kind: "PERCENT", value: 20 },
      promoCode: promoCode({ value: 30 }),
      manualSalonDiscount: { kind: "AMOUNT", value: 50_000 },
    });
    expect(result).toMatchObject({
      salonDiscount: 50_000,
      salonDiscountSource: "MANUAL",
      promoCodeId: null,
      promoCodeIssue: "manual_discount",
      totalPrice: 235_000,
    });
  });

  it("never makes the total negative", () => {
    const result = price({
      manualSalonDiscount: { kind: "AMOUNT", value: 1_000_000 },
    });
    expect(result.salonDiscount).toBe(285_000);
    expect(result.totalPrice).toBe(0);
  });
});
