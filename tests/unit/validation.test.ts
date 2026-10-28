import { describe, expect, it } from "vitest";
import { plural } from "@/lib/plural";
import { minutesToTime, timeToMinutes } from "@/lib/time";
import { serviceSchema } from "@/lib/validation/catalog";
import {
  promotionSchema,
  timeOffSchema,
  weekScheduleSchema,
} from "@/lib/validation/masters";
import { promoCodeSchema } from "@/lib/validation/promo-codes";
import { userCreateSchema } from "@/lib/validation/users";

const emptyWeek = () =>
  Array.from({ length: 7 }, () => [] as { start: string; end: string }[]);

function issues(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return (result.error?.issues ?? []).map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
}

describe("time helpers", () => {
  it("converts between minutes and HH:MM", () => {
    expect(minutesToTime(615)).toBe("10:15");
    expect(minutesToTime(1440)).toBe("24:00");
    expect(timeToMinutes("10:15")).toBe(615);
    expect(timeToMinutes("24:00")).toBe(1440);
    for (const bad of ["24:01", "10:60", "9:00", "", "10-00"]) {
      expect(timeToMinutes(bad)).toBeNull();
    }
  });
});

describe("plural", () => {
  it("picks the Russian plural form", () => {
    const forms = ["мастер", "мастера", "мастеров"] as const;
    expect(
      [1, 2, 5, 11, 12, 21, 22, 25, 111].map((n) => plural(n, forms)),
    ).toEqual([
      "мастер",
      "мастера",
      "мастеров",
      "мастеров",
      "мастеров",
      "мастер",
      "мастера",
      "мастеров",
      "мастеров",
    ]);
  });
});

describe("week schedule", () => {
  it("accepts a shift with a break", () => {
    const days = emptyWeek();
    days[1] = [
      { start: "10:00", end: "14:00" },
      { start: "15:00", end: "20:00" },
    ];
    expect(weekScheduleSchema.safeParse({ days }).success).toBe(true);
  });

  it("rejects overlapping intervals and reversed ones", () => {
    const days = emptyWeek();
    days[0] = [
      { start: "10:00", end: "14:00" },
      { start: "13:00", end: "18:00" },
    ];
    days[2] = [{ start: "18:00", end: "10:00" }];
    days[3] = [{ start: "10:03", end: "12:00" }];
    expect(issues(weekScheduleSchema.safeParse({ days }))).toEqual([
      "days.0.1.start: Интервалы пересекаются",
      "days.2.0.end: Конец раньше начала",
      "days.3.0.end: Шаг — 5 минут",
    ]);
  });
});

describe("discounts", () => {
  const base = {
    title: "Акция",
    serviceId: "",
    validFrom: "",
    validUntil: "",
    isActive: true,
  };

  it("limits percent discounts to whole 1..100", () => {
    for (const value of [0, 101, 12.5]) {
      expect(
        promotionSchema.safeParse({ ...base, kind: "PERCENT", value }).success,
      ).toBe(false);
    }
    expect(
      promotionSchema.safeParse({ ...base, kind: "PERCENT", value: 100 })
        .success,
    ).toBe(true);
  });

  it("allows kopecks in fixed amounts but not finer", () => {
    expect(
      promotionSchema.safeParse({ ...base, kind: "AMOUNT", value: 299.99 })
        .success,
    ).toBe(true);
    expect(
      promotionSchema.safeParse({ ...base, kind: "AMOUNT", value: 0.001 })
        .success,
    ).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    expect(
      issues(
        promoCodeSchema.safeParse({
          code: "X100",
          kind: "PERCENT",
          value: 10,
          validFrom: "2026-11-10",
          validUntil: "2026-11-01",
          maxUses: null,
          isActive: true,
        }),
      ),
    ).toEqual(["validUntil: Дата окончания раньше даты начала"]);
  });

  it("rejects calendar days that do not exist", () => {
    const promo = {
      code: "X100",
      kind: "PERCENT" as const,
      value: 10,
      validFrom: "",
      maxUses: null,
      isActive: true,
    };
    for (const validUntil of ["2026-02-29", "2026-02-31", "2026-04-31"]) {
      expect(
        issues(promoCodeSchema.safeParse({ ...promo, validUntil })),
      ).toEqual(["validUntil: Укажите дату"]);
    }
    expect(
      promoCodeSchema.safeParse({ ...promo, validUntil: "2028-02-29" }).success,
    ).toBe(true);
    expect(
      timeOffSchema.safeParse({
        allDay: true,
        fromDate: "2026-02-31",
        toDate: "2026-02-31",
        fromTime: "",
        toTime: "",
        reason: "",
      }).success,
    ).toBe(false);
  });

  it("rejects promo codes with spaces or Cyrillic", () => {
    for (const code of ["ПРОМО10", "WELCOME 10", "AB"]) {
      expect(
        promoCodeSchema.safeParse({
          code,
          kind: "PERCENT",
          value: 10,
          validFrom: "",
          validUntil: "",
          maxUses: null,
          isActive: true,
        }).success,
      ).toBe(false);
    }
  });
});

describe("other forms", () => {
  it("requires services to last a multiple of 5 minutes", () => {
    const service = {
      categoryId: "c1",
      name: "Стрижка",
      description: "",
      priceRub: 1000,
      bufferMin: null,
      isActive: true,
      sortOrder: 0,
    };
    expect(
      serviceSchema.safeParse({ ...service, durationMin: 55 }).success,
    ).toBe(true);
    expect(
      serviceSchema.safeParse({ ...service, durationMin: 52 }).success,
    ).toBe(false);
  });

  it("requires the end of a partial time off after its start", () => {
    const timeOff = {
      allDay: false,
      fromDate: "2026-11-20",
      toDate: "2026-11-20",
      reason: "",
    };
    expect(
      timeOffSchema.safeParse({
        ...timeOff,
        fromTime: "14:00",
        toTime: "13:00",
      }).success,
    ).toBe(false);
    expect(
      timeOffSchema.safeParse({
        ...timeOff,
        fromTime: "13:00",
        toTime: "14:00",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty partial time off across midnight and off-grid times", () => {
    expect(
      timeOffSchema.safeParse({
        allDay: false,
        fromDate: "2026-11-20",
        fromTime: "24:00",
        toDate: "2026-11-21",
        toTime: "00:00",
        reason: "",
      }).success,
    ).toBe(false);
    expect(
      timeOffSchema.safeParse({
        allDay: false,
        fromDate: "2026-11-20",
        fromTime: "23:55",
        toDate: "2026-11-21",
        toTime: "00:05",
        reason: "",
      }).success,
    ).toBe(true);
    expect(
      issues(
        timeOffSchema.safeParse({
          allDay: false,
          fromDate: "2026-11-20",
          fromTime: "13:02",
          toDate: "2026-11-20",
          toTime: "14:00",
          reason: "",
        }),
      ),
    ).toEqual(["fromTime: Шаг — 5 минут"]);
  });

  it("requires a master card for the MASTER role", () => {
    const user = {
      name: "Иван Петров",
      email: "ivan@example.com",
      password: "password-123",
      masterId: "",
    };
    expect(userCreateSchema.safeParse({ ...user, role: "ADMIN" }).success).toBe(
      true,
    );
    expect(
      issues(userCreateSchema.safeParse({ ...user, role: "MASTER" })),
    ).toEqual(["masterId: Выберите карточку мастера"]);
  });
});
