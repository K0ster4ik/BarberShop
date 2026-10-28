import { describe, expect, it } from "vitest";
import {
  addDays,
  minutesBetween,
  salonTimeToInstant,
  toSalonDate,
  toSalonMinutes,
  weekdayOf,
} from "@/lib/time";

describe("toSalonDate", () => {
  it("uses the salon time zone, not UTC", () => {
    // 21:30 UTC — уже 00:30 следующего дня в Москве
    expect(toSalonDate(new Date("2026-11-03T21:30:00Z"))).toBe("2026-11-04");
    expect(toSalonDate(new Date("2026-11-03T20:59:00Z"))).toBe("2026-11-03");
  });
});

describe("toSalonMinutes", () => {
  it("returns minutes since midnight in the salon time zone", () => {
    expect(toSalonMinutes(new Date("2026-11-03T07:15:00Z"))).toBe(615);
    expect(toSalonMinutes(new Date("2026-11-03T21:00:00Z"))).toBe(0);
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-11-03", 0)).toBe("2026-11-03");
  });

  it("rejects malformed dates", () => {
    expect(() => addDays("2026-13-01", 1)).toThrow(RangeError);
    expect(() => addDays("03.11.2026", 1)).toThrow(RangeError);
    // Date сам переносит 31 февраля на 3 марта — такая дата должна быть ошибкой
    expect(() => addDays("2026-02-31", 1)).toThrow(RangeError);
  });
});

describe("weekdayOf", () => {
  it("counts from Monday = 0 to Sunday = 6", () => {
    expect(weekdayOf("2026-11-02")).toBe(0);
    expect(weekdayOf("2026-11-08")).toBe(6);
  });
});

describe("salonTimeToInstant", () => {
  it("converts salon wall-clock time to UTC", () => {
    expect(salonTimeToInstant("2026-11-03", 600)).toEqual(
      new Date("2026-11-03T07:00:00Z"),
    );
  });

  it("rolls minutes outside the day into neighbouring days", () => {
    expect(salonTimeToInstant("2026-11-03", 1440)).toEqual(
      new Date("2026-11-03T21:00:00Z"),
    );
    expect(salonTimeToInstant("2026-11-03", -60)).toEqual(
      new Date("2026-11-02T20:00:00Z"),
    );
  });

  it("handles daylight saving time switches", () => {
    // В 2026 году Европа переходит на летнее время 29 марта.
    const tz = "Europe/Berlin";
    expect(salonTimeToInstant("2026-03-28", 600, tz)).toEqual(
      new Date("2026-03-28T09:00:00Z"),
    );
    expect(salonTimeToInstant("2026-03-29", 600, tz)).toEqual(
      new Date("2026-03-29T08:00:00Z"),
    );
    const dayLength = minutesBetween(
      salonTimeToInstant("2026-03-29", 0, tz),
      salonTimeToInstant("2026-03-29", 1440, tz),
    );
    expect(dayLength).toBe(23 * 60);
  });

  it("moves a time that does not exist forward, never back", () => {
    // 29 марта 2026 в Берлине часы переводят с 02:00 на 03:00 — 02:30 не бывает.
    // Как в RFC 5545 и Temporal: смещение до перехода, то есть 03:30 по местным часам.
    const tz = "Europe/Berlin";
    expect(salonTimeToInstant("2026-03-29", 150, tz)).toEqual(
      new Date("2026-03-29T01:30:00Z"),
    );
    expect(salonTimeToInstant("2026-03-29", 180, tz)).toEqual(
      new Date("2026-03-29T01:00:00Z"),
    );
  });

  it("picks the second 02:30 when clocks go back", () => {
    // 25 октября 2026 02:30 в Берлине бывает дважды; берётся зимнее (второе)
    expect(salonTimeToInstant("2026-10-25", 150, "Europe/Berlin")).toEqual(
      new Date("2026-10-25T01:30:00Z"),
    );
  });
});
