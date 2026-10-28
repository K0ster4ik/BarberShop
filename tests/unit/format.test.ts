import { describe, expect, it } from "vitest";
import {
  formatDiscountPeriod,
  formatTimeOffPeriod,
} from "@/components/admin/format";

// Intl ставит неразрывные и узкие пробелы — сравниваем текст, а не их вид.
const plain = (text: string) => text.replace(/\s/g, " ");

describe("formatDiscountPeriod", () => {
  it("shortens shared parts of the range and keeps open ends readable", () => {
    expect(plain(formatDiscountPeriod("2026-11-05", "2026-11-09"))).toBe(
      "5–9 ноября 2026 г.",
    );
    expect(plain(formatDiscountPeriod("2026-12-30", "2027-01-02"))).toBe(
      "30 декабря 2026 г. – 2 января 2027 г.",
    );
    expect(plain(formatDiscountPeriod("", "2026-12-26"))).toBe(
      "по 26 декабря 2026 г.",
    );
    expect(plain(formatDiscountPeriod("", ""))).toBe("бессрочно");
  });
});

describe("formatTimeOffPeriod", () => {
  it("shows whole days as dates, including the last day", () => {
    // 5–10 ноября 00:00 по Москве = отпуск по 9-е включительно
    expect(
      plain(
        formatTimeOffPeriod(
          new Date("2026-11-04T21:00:00Z"),
          new Date("2026-11-09T21:00:00Z"),
        ),
      ),
    ).toBe("5–9 ноября 2026 г.");
    expect(
      plain(
        formatTimeOffPeriod(
          new Date("2026-11-04T21:00:00Z"),
          new Date("2026-11-05T21:00:00Z"),
        ),
      ),
    ).toBe("5 ноября 2026 г.");
  });

  it("shows a partial day with its hours", () => {
    expect(
      plain(
        formatTimeOffPeriod(
          new Date("2026-10-30T09:00:00Z"),
          new Date("2026-10-30T11:00:00Z"),
        ),
      ),
    ).toBe("30 октября 2026 г., 12:00–14:00");
  });
});
