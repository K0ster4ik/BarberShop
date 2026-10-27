import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BookingStatus, PrismaClient } from "@/generated/prisma/client";
import { isBookingOverlapError } from "@/server/bookings/errors";
import { clearBusinessData } from "@/server/demo/reset";
import { createTestDb } from "./test-db";

// Constraint booking_no_overlap (DESIGN.md, 5.3) и то, как его нарушение видно из Prisma.

let db: PrismaClient;
let masterId: string;
let otherMasterId: string;
let clientId: string;

const at = (time: string) => new Date(`2030-01-07T${time}:00Z`);

function insertBooking(booking: {
  start: string;
  end: string;
  blockedUntil?: string;
  masterId?: string;
  status?: BookingStatus;
  deletedAt?: Date;
}) {
  const startsAt = at(booking.start);
  const endsAt = at(booking.end);
  const blockedUntil = at(booking.blockedUntil ?? booking.end);
  const status = booking.status ?? "CONFIRMED";
  return db.booking.create({
    data: {
      clientId,
      masterId: booking.masterId ?? masterId,
      startsAt,
      endsAt,
      blockedUntil,
      durationMin: (endsAt.getTime() - startsAt.getTime()) / 60_000,
      bufferMin: (blockedUntil.getTime() - endsAt.getTime()) / 60_000,
      status,
      cancelledAt: status === "CANCELLED" ? new Date() : null,
      deletedAt: booking.deletedAt ?? null,
      subtotal: 180_000,
      totalPrice: 180_000,
    },
  });
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

beforeAll(() => {
  db = createTestDb();
});

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await db.$transaction((tx) => clearBusinessData(tx));
  const [master, otherMaster, client] = await Promise.all([
    db.master.create({ data: { name: "Мастер" } }),
    db.master.create({ data: { name: "Другой мастер" } }),
    db.client.create({ data: { name: "Клиент", phone: "+79990000001" } }),
  ]);
  masterId = master.id;
  otherMasterId = otherMaster.id;
  clientId = client.id;
});

describe("booking_no_overlap", () => {
  it.each(["PENDING", "CONFIRMED", "COMPLETED"] as const)(
    "rejects a booking that overlaps a %s one",
    async (status) => {
      await insertBooking({ start: "10:00", end: "11:00", status });
      const error = await errorOf(
        insertBooking({ start: "10:30", end: "11:30" }),
      );
      expect(isBookingOverlapError(error)).toBe(true);
    },
  );

  it("allows a booking right after the previous buffer", async () => {
    await insertBooking({
      start: "10:00",
      end: "11:00",
      blockedUntil: "11:10",
    });
    await expect(
      insertBooking({ start: "11:10", end: "12:00" }),
    ).resolves.toBeDefined();
  });

  it("rejects a booking that starts inside the previous buffer", async () => {
    await insertBooking({
      start: "10:00",
      end: "11:00",
      blockedUntil: "11:10",
    });
    const error = await errorOf(
      insertBooking({ start: "11:00", end: "11:30" }),
    );
    expect(isBookingOverlapError(error)).toBe(true);
  });

  it.each([
    ["cancelled", { status: "CANCELLED" as const }],
    ["no-show", { status: "NO_SHOW" as const }],
    ["soft-deleted", { deletedAt: new Date() }],
  ])("does not let a %s booking hold the slot", async (_, booking) => {
    await insertBooking({ start: "10:00", end: "11:00", ...booking });
    await expect(
      insertBooking({ start: "10:00", end: "11:00" }),
    ).resolves.toBeDefined();
  });

  it("allows the same time for another master", async () => {
    await insertBooking({ start: "10:00", end: "11:00" });
    await expect(
      insertBooking({ start: "10:00", end: "11:00", masterId: otherMasterId }),
    ).resolves.toBeDefined();
  });

  it("lets exactly one of two concurrent bookings for a slot through", async () => {
    const attempt = () =>
      db.$transaction(async (tx) => {
        await tx.client.findFirst(); // открываем транзакцию до вставки, как в createBooking
        return tx.booking.create({
          data: {
            clientId,
            masterId,
            startsAt: at("15:00"),
            endsAt: at("16:00"),
            blockedUntil: at("16:10"),
            durationMin: 60,
            bufferMin: 10,
            subtotal: 0,
            totalPrice: 0,
          },
        });
      });

    const results = await Promise.allSettled([attempt(), attempt()]);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(isBookingOverlapError(rejected[0]?.reason)).toBe(true);
  });

  it("does not mistake other database errors for an overlap", async () => {
    // blockedUntil раньше endsAt нарушает CHECK booking_interval_valid
    const error = await errorOf(
      insertBooking({ start: "10:00", end: "11:00", blockedUntil: "10:30" }),
    );
    expect(error).not.toBeNull();
    expect(isBookingOverlapError(error)).toBe(false);
  });
});
