import { describe, expect, it } from "vitest";
import { formatNearest } from "@/server/site/landing";

// Вторник, 14:30 по Москве.
const now = new Date("2026-11-03T11:30:00Z");

describe("formatNearest", () => {
  it("says today and tomorrow in words", () => {
    expect(formatNearest(new Date("2026-11-03T14:30:00Z"), now)).toBe(
      "сегодня 17:30",
    );
    expect(formatNearest(new Date("2026-11-04T07:00:00Z"), now)).toBe(
      "завтра 10:00",
    );
  });

  it("uses the salon day, not UTC", () => {
    // 21:30 UTC вторника — это уже 00:30 среды по Москве
    expect(formatNearest(new Date("2026-11-03T21:30:00Z"), now)).toBe(
      "завтра 00:30",
    );
  });

  it("names the weekday and date further ahead", () => {
    expect(
      formatNearest(new Date("2026-11-06T07:00:00Z"), now).replace(/\s/g, " "),
    ).toBe("пт, 6 ноября в 10:00");
  });
});
