import { describe, expect, it } from "vitest";
import { formatPhone, maskPhone, normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("turns any common way of writing a number into E.164", () => {
    expect(normalizePhone("8 (999) 123-45-67", "RU")).toBe("+79991234567");
    expect(normalizePhone("+7 999 123 45 67", "RU")).toBe("+79991234567");
    expect(normalizePhone("9991234567", "RU")).toBe("+79991234567");
    expect(normalizePhone("01511 2345678", "DE")).toBe("+4915112345678");
  });

  it("trusts an explicit country code over the selected country", () => {
    // Выбрана Россия, но номер введён с +44 — это британский номер
    expect(normalizePhone("+44 7911 123456", "RU")).toBe("+447911123456");
  });

  it("rejects numbers that cannot exist", () => {
    for (const raw of [
      "",
      "12345",
      "+7999123",
      "телефон",
      "+7 999 123 45 67 89",
    ]) {
      expect(normalizePhone(raw, "RU")).toBeNull();
    }
  });
});

describe("formatPhone", () => {
  it("formats a stored number for people", () => {
    expect(formatPhone("+79991234567")).toBe("+7 999 123 45 67");
    expect(formatPhone("+4915112345678")).toBe("+49 1511 2345678");
  });
});

describe("maskPhone", () => {
  it("hides the middle of the number for the public channel", () => {
    expect(maskPhone("+79991234567")).toBe("+7 999 *** ** 67");
    expect(maskPhone("+4915112345678")).toBe("+49 1511 *****78");
    expect(maskPhone("+380501234567")).toBe("+380 50 *** **67");
  });

  it("never shows more than the last two digits of the subscriber part", () => {
    const masked = maskPhone("+12025550143");
    expect(masked).toBe("+1 202 *** **43");
    expect(masked.replace(/\D/g, "")).toBe("120243");
  });
});
