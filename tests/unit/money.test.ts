import { describe, expect, it } from "vitest";
import {
  formatMoney,
  kopecksToRubles,
  roundDiscountUp,
  rublesToKopecks,
} from "@/lib/money";

// Intl ставит неразрывные пробелы; для сравнения приводим их к обычным.
const plain = (value: string) => value.replace(/\s/gu, " ");

describe("formatMoney", () => {
  it("formats whole rubles without kopecks", () => {
    expect(plain(formatMoney(150_000))).toBe("1 500 ₽");
    expect(plain(formatMoney(0))).toBe("0 ₽");
  });

  it("shows kopecks when they are present", () => {
    expect(plain(formatMoney(150_050))).toBe("1 500,50 ₽");
    expect(plain(formatMoney(5))).toBe("0,05 ₽");
  });

  it("rejects non-integer amounts", () => {
    expect(() => formatMoney(10.5)).toThrow(RangeError);
    expect(() => formatMoney(Number.NaN)).toThrow(RangeError);
  });
});

describe("rublesToKopecks", () => {
  it("converts rubles to kopecks", () => {
    expect(rublesToKopecks(1500)).toBe(150_000);
    expect(rublesToKopecks(1500.5)).toBe(150_050);
  });

  it("rounds away floating point noise", () => {
    expect(rublesToKopecks(19.99)).toBe(1999);
    expect(rublesToKopecks(0.1 + 0.2)).toBe(30);
  });

  it("rejects non-finite values", () => {
    expect(() => rublesToKopecks(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("roundDiscountUp", () => {
  it("rounds up to a whole ruble", () => {
    expect(roundDiscountUp(27_750)).toBe(27_800);
    expect(roundDiscountUp(27_800)).toBe(27_800);
    expect(roundDiscountUp(1)).toBe(100);
    expect(roundDiscountUp(0)).toBe(0);
  });
});

describe("kopecksToRubles", () => {
  it("is the inverse of rublesToKopecks", () => {
    expect(kopecksToRubles(rublesToKopecks(1234.56))).toBe(1234.56);
  });
});
