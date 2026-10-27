import { describe, expect, it } from "vitest";
import { discountAmount } from "@/server/pricing/discount";

describe("discountAmount", () => {
  it("applies a percent discount rounded up to a whole ruble", () => {
    // 15% от 1 850 ₽ = 277,50 ₽ → 278 ₽ в пользу клиента
    expect(discountAmount(185_000, { kind: "PERCENT", value: 15 })).toBe(
      27_800,
    );
    expect(discountAmount(180_000, { kind: "PERCENT", value: 20 })).toBe(
      36_000,
    );
  });

  it("applies a fixed amount", () => {
    expect(discountAmount(120_000, { kind: "AMOUNT", value: 30_000 })).toBe(
      30_000,
    );
  });

  it("rounds a fixed amount with kopecks up to a whole ruble", () => {
    expect(discountAmount(120_000, { kind: "AMOUNT", value: 150 })).toBe(200);
  });

  it("never exceeds the price", () => {
    expect(discountAmount(20_000, { kind: "AMOUNT", value: 50_000 })).toBe(
      20_000,
    );
    expect(discountAmount(20_000, { kind: "PERCENT", value: 100 })).toBe(
      20_000,
    );
    // 80% от 1,50 ₽ = 1,20 ₽ → округление дало бы 2 ₽, но не больше цены
    expect(discountAmount(150, { kind: "PERCENT", value: 80 })).toBe(150);
  });

  it("returns zero for a free service", () => {
    expect(discountAmount(0, { kind: "PERCENT", value: 10 })).toBe(0);
  });
});
