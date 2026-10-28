import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { salon } from "@/config/salon";
import type { BookingStatus, PrismaClient } from "@/generated/prisma/client";
import {
  addDays,
  addMinutes,
  MINUTES_PER_DAY,
  salonTimeToInstant,
  toSalonDate,
} from "@/lib/time";
import { isBookingOverlapError } from "@/server/bookings/errors";
import { ACTIVE_BOOKING_STATUSES } from "@/server/bookings/status";
import { getAvailableSlots } from "@/server/slots/available";
import { loadMasterDays, loadMasterSchedule } from "@/server/slots/load";
import { seedDemo, TEST_NOW } from "./fixtures";
import { createTestDb } from "./test-db";

// Слоты на настоящих демо-данных против constraint booking_no_overlap (DESIGN.md, 5.3):
// расчёт и база должны сходиться в том, что время свободно.

let db: PrismaClient;
let masterIds: string[];
let clientId: string;

const DURATION = 45; // нестандартная длина: слоты встают и по сетке, и после чужих записей
const BUFFER = 10;
const today = toSalonDate(TEST_NOW);

beforeAll(async () => {
  db = createTestDb();
  await seedDemo(db);
  masterIds = (await db.master.findMany({ select: { id: true } })).map(
    (master) => master.id,
  );
  clientId = (await db.client.findFirstOrThrow({ select: { id: true } })).id;
});

afterAll(async () => {
  await db.$disconnect();
});

const ROLLBACK = new Error("rollback");

function bookingData(
  masterId: string,
  start: Date,
  status: BookingStatus = "CONFIRMED",
) {
  const endsAt = addMinutes(start, DURATION);
  return {
    clientId,
    masterId,
    startsAt: start,
    endsAt,
    blockedUntil: addMinutes(endsAt, BUFFER),
    durationMin: DURATION,
    bufferMin: BUFFER,
    status,
    cancelledAt: status === "CANCELLED" ? TEST_NOW : null,
    subtotal: 100_000,
    totalPrice: 100_000,
  };
}

/** Пустит ли база такую запись. Вставка откатывается и данные не меняет. */
async function tryBooking(masterId: string, start: Date) {
  const error = await db
    .$transaction(async (tx) => {
      await tx.booking.create({ data: bookingData(masterId, start) });
      throw ROLLBACK;
    })
    .catch((reason: unknown) => reason);
  if (error === ROLLBACK) return "accepted";
  if (isBookingOverlapError(error)) return "overlap";
  throw error;
}

async function slotsOn(date: string) {
  const days = await loadMasterDays(db, masterIds, date);
  return days.map((day) => ({
    ...day,
    slots: getAvailableSlots({
      date,
      durationMin: DURATION,
      bufferMin: BUFFER,
      workingHours: day.workingHours,
      timeOffs: day.timeOffs,
      bookings: day.bookings,
      now: TEST_NOW,
      settings: salon,
    }),
  }));
}

describe("slots on demo data", () => {
  it("offers only times the database accepts and that miss time off", async () => {
    let checked = 0;
    for (const offset of [0, 1, 2, 3]) {
      for (const day of await slotsOn(addDays(today, offset))) {
        for (const start of day.slots) {
          const where = `${day.masterId} ${start.toISOString()}`;
          expect(await tryBooking(day.masterId, start), where).toBe("accepted");
          const end = addMinutes(start, DURATION + BUFFER);
          expect(
            day.timeOffs.some((off) => off.start < end && start < off.end),
            where,
          ).toBe(false);
          checked++;
        }
      }
    }
    // Демо-салон занят, но не полностью: проверка не должна пройти впустую.
    expect(checked).toBeGreaterThan(20);
  });

  it("would notice a slot inside an existing booking", async () => {
    const tomorrow = addDays(today, 1);
    const [day] = await loadMasterDays(db, masterIds, tomorrow);
    const busy = day?.bookings[0];
    if (!day || !busy) throw new Error("Demo master has no bookings tomorrow");
    expect(await tryBooking(day.masterId, busy.start)).toBe("overlap");
  });

  it("ignores cancelled and deleted bookings", async () => {
    const date = addDays(today, 2);
    const [day] = await slotsOn(date);
    const start = day?.slots[0];
    if (!day || !start) throw new Error("No free slot to test with");

    const ghosts = await Promise.all([
      db.booking.create({
        data: bookingData(day.masterId, start, "CANCELLED"),
      }),
      db.booking.create({
        data: { ...bookingData(day.masterId, start), deletedAt: TEST_NOW },
      }),
    ]);
    try {
      const [again] = await slotsOn(date);
      expect(again?.slots).toContainEqual(start);
      expect(again?.bookedMin).toBe(day.bookedMin);
    } finally {
      await db.booking.deleteMany({
        where: { id: { in: ghosts.map((ghost) => ghost.id) } },
      });
    }
  });

  it("loads a date range exactly like day by day", async () => {
    const last = addDays(today, 6);
    const schedule = await loadMasterSchedule(db, masterIds, today, last);
    for (let offset = 0; offset <= 6; offset++) {
      const date = addDays(today, offset);
      expect(schedule(date), date).toEqual(
        await loadMasterDays(db, masterIds, date),
      );
    }
  });

  it("counts the day's booked minutes for picking «any master»", async () => {
    const date = addDays(today, 1);
    const from = salonTimeToInstant(date, 0);
    const to = salonTimeToInstant(date, MINUTES_PER_DAY);
    let total = 0;
    for (const day of await loadMasterDays(db, masterIds, date)) {
      const rows = await db.booking.findMany({
        where: {
          masterId: day.masterId,
          status: { in: ACTIVE_BOOKING_STATUSES },
          deletedAt: null,
          startsAt: { gte: from, lt: to },
        },
        select: { durationMin: true },
      });
      expect(day.bookedMin).toBe(
        rows.reduce((sum, row) => sum + row.durationMin, 0),
      );
      total += day.bookedMin;
    }
    expect(total).toBeGreaterThan(0);
  });
});
