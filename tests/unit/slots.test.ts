import { describe, expect, it } from "vitest";
import { salon } from "@/config/salon";
import { salonTimeToInstant, timeToMinutes } from "@/lib/time";
import { combineMasterSlots } from "@/server/slots/any-master";
import { getAvailableSlots, type Interval } from "@/server/slots/available";

// Вторник 3 ноября 2026, Москва (UTC+3, без перехода на летнее время).
const DATE = "2026-11-03";

function at(time: string, date = DATE): Date {
  const minutes = timeToMinutes(time);
  if (minutes === null) throw new Error(`Bad time ${time}`);
  return salonTimeToInstant(date, minutes);
}

const span = (start: string, end: string): Interval => ({
  start: at(start),
  end: at(end),
});

const shift = (start: string, end: string) => ({
  startMin: timeToMinutes(start) ?? 0,
  endMin: timeToMinutes(end) ?? 0,
});

/** Слоты как «ЧЧ:ММ» по Москве — так ошибку видно сразу. */
function slots(input: Partial<Parameters<typeof getAvailableSlots>[0]>) {
  return getAvailableSlots({
    date: DATE,
    durationMin: 60,
    bufferMin: 10,
    workingHours: [shift("10:00", "14:00")],
    timeOffs: [],
    bookings: [],
    now: at("12:00", "2026-11-02"), // накануне: отсечка по времени не мешает
    settings: salon,
    ...input,
  }).map((slot) =>
    slot.toLocaleTimeString("ru-RU", {
      timeZone: salon.timezone,
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
}

describe("getAvailableSlots", () => {
  it("returns nothing on a day off", () => {
    expect(slots({ workingHours: [] })).toEqual([]);
  });

  it("offers grid times so that the service ends by the end of the shift", () => {
    expect(slots({ workingHours: [shift("10:00", "12:00")] })).toEqual([
      "10:00",
      "10:15",
      "10:30",
      "10:45",
      "11:00",
    ]);
  });

  it("does not let a slot cross the break between shifts", () => {
    const result = slots({
      workingHours: [shift("10:00", "13:00"), shift("14:00", "16:00")],
    });
    expect(result).toContain("12:00"); // заканчивается ровно к перерыву
    expect(result).not.toContain("12:15");
    expect(result).not.toContain("13:30");
    expect(result).toContain("14:00");
    expect(result.at(-1)).toBe("15:00");
  });

  it("treats touching working intervals as one shift", () => {
    expect(
      slots({
        workingHours: [shift("10:00", "12:00"), shift("12:00", "14:00")],
      }),
    ).toContain("11:30");
  });

  it("skips a service longer than any free window", () => {
    expect(
      slots({ workingHours: [shift("10:00", "11:00")], durationMin: 90 }),
    ).toEqual([]);
  });

  it("allows starting right at another booking's buffer end, not inside it", () => {
    // Чужая запись 10:00–11:00 + уборка до 11:10
    const result = slots({
      durationMin: 30,
      bookings: [span("10:00", "11:10")],
    });
    expect(result).not.toContain("11:00");
    expect(result).toContain("11:10");
    expect(result).toContain("11:15");
  });

  it("keeps the new booking's buffer clear of the next booking", () => {
    // Следующая запись в 12:00: 60 мин + 10 уборки должны закончиться к 12:00
    const result = slots({ bookings: [span("12:00", "13:10")] });
    expect(result).toContain("10:45"); // 10:45–11:45, уборка до 11:55
    expect(result).not.toContain("11:00"); // уборка залезла бы на 12:00
  });

  it("lets the buffer run past the end of the shift", () => {
    // 13:30–14:00 и уборка после закрытия
    expect(slots({ durationMin: 30 })).toContain("13:30");
  });

  it("keeps the buffer clear of a booking made after hours", () => {
    // Админ записал клиента на 14:00, хотя смена до 14:00
    const result = slots({
      durationMin: 30,
      bookings: [span("14:00", "15:10")],
    });
    expect(result).toContain("13:15");
    expect(result).not.toContain("13:30");
  });

  it("offers a slot right after a booking of non-standard length", () => {
    // 10:00 + 55 мин + 10 уборки = свободно с 11:05
    const result = slots({
      durationMin: 30,
      bookings: [span("10:00", "11:05")],
    });
    expect(result.slice(0, 3)).toEqual(["11:05", "11:15", "11:30"]);
  });

  it("respects a whole-day time off", () => {
    expect(
      slots({
        timeOffs: [{ start: at("00:00"), end: at("00:00", "2026-11-04") }],
      }),
    ).toEqual([]);
  });

  it("respects a partial time off, buffer included", () => {
    const result = slots({
      workingHours: [shift("10:00", "18:00")],
      timeOffs: [span("12:00", "13:30")],
    });
    expect(result).toContain("10:45");
    expect(result).not.toContain("11:00"); // уборка до 12:10 — уже отсутствие
    expect(result).not.toContain("12:30");
    expect(result).toContain("13:30");
  });

  it("drops slots that are past or less than an hour away without odd times", () => {
    const result = slots({
      durationMin: 30,
      now: at("09:37"),
    });
    // Ближайшее разрешённое — 10:37, но кандидата 10:37 нет: первый слот по сетке
    expect(result[0]).toBe("10:45");

    expect(slots({ durationMin: 30, now: at("10:00") })[0]).toBe("11:00");
    expect(slots({ now: at("13:30") })).toEqual([]);
  });

  it("places UTC bookings on the salon's wall clock", () => {
    // 07:00 UTC — это 10:00 по Москве
    const raw = getAvailableSlots({
      date: DATE,
      durationMin: 60,
      bufferMin: 10,
      workingHours: [shift("10:00", "12:30")],
      timeOffs: [],
      bookings: [
        {
          start: new Date("2026-11-03T07:00:00Z"),
          end: new Date("2026-11-03T08:10:00Z"),
        },
      ],
      now: new Date("2026-11-02T09:00:00Z"),
      settings: salon,
    });
    expect(raw.map((slot) => slot.toISOString())).toEqual([
      "2026-11-03T08:10:00.000Z",
      "2026-11-03T08:15:00.000Z",
      "2026-11-03T08:30:00.000Z",
    ]);
  });

  it("keeps the grid on the wall clock across a daylight saving switch", () => {
    // 29 марта 2026 Берлин переходит на летнее время: 10:00 — это 08:00 UTC, а не 09:00
    const raw = getAvailableSlots({
      date: "2026-03-29",
      durationMin: 60,
      bufferMin: 10,
      workingHours: [shift("10:00", "11:30")],
      timeOffs: [],
      bookings: [],
      now: new Date("2026-03-28T09:00:00Z"),
      settings: { ...salon, timezone: "Europe/Berlin" },
    });
    expect(raw.map((slot) => slot.toISOString())).toEqual([
      "2026-03-29T08:00:00.000Z",
      "2026-03-29T08:15:00.000Z",
      "2026-03-29T08:30:00.000Z",
    ]);
  });

  it("aligns the grid to the salon's midnight, not to UTC", () => {
    // Индия — UTC+5:30: часовая сетка по местным часам — 10:00, 11:00, а не 10:30, 11:30
    const raw = getAvailableSlots({
      date: DATE,
      durationMin: 30,
      bufferMin: 0,
      workingHours: [shift("10:00", "12:00")],
      timeOffs: [],
      bookings: [],
      now: new Date("2026-11-02T09:00:00Z"),
      settings: { ...salon, timezone: "Asia/Kolkata", slotStepMin: 60 },
    });
    expect(raw.map((slot) => slot.toISOString())).toEqual([
      "2026-11-03T04:30:00.000Z",
      "2026-11-03T05:30:00.000Z",
    ]);
  });

  it("returns nothing for past days and days beyond the booking horizon", () => {
    const now = at("09:00", "2026-11-03");
    expect(slots({ date: "2026-11-02", now })).toEqual([]);
    expect(slots({ date: "2026-11-03", now })).not.toEqual([]);
    // 30 дней, считая сегодняшний: последний — 2 декабря
    expect(slots({ date: "2026-12-02", now })).not.toEqual([]);
    expect(slots({ date: "2026-12-03", now })).toEqual([]);
  });

  it("returns sorted unique times", () => {
    const raw = getAvailableSlots({
      date: DATE,
      durationMin: 30,
      bufferMin: 10,
      workingHours: [shift("10:00", "12:00")],
      timeOffs: [span("10:30", "11:00")],
      bookings: [span("11:00", "11:15")],
      now: at("12:00", "2026-11-02"),
      settings: salon,
    });
    const times = raw.map((slot) => slot.getTime());
    expect(times).toEqual([...new Set(times)].sort((a, b) => a - b));
  });

  it("rejects a non-positive duration", () => {
    expect(() => slots({ durationMin: 0 })).toThrow(RangeError);
  });
});

describe("combineMasterSlots", () => {
  it("merges masters' slots and prefers the least busy master", () => {
    const result = combineMasterSlots([
      { masterId: "busy", slots: [at("10:00"), at("11:00")], bookedMin: 300 },
      { masterId: "free", slots: [at("11:00"), at("12:00")], bookedMin: 60 },
      { masterId: "same", slots: [at("11:00")], bookedMin: 60 },
    ]);
    expect(
      result.map((slot) => [slot.start.toISOString(), slot.masterIds]),
    ).toEqual([
      [at("10:00").toISOString(), ["busy"]],
      // при равной загрузке — в исходном порядке
      [at("11:00").toISOString(), ["free", "same", "busy"]],
      [at("12:00").toISOString(), ["free"]],
    ]);
  });
});
