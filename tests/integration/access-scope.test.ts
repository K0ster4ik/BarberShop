import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  bookingScope,
  clientScope,
  masterScope,
  type StaffUser,
} from "@/server/auth/access";
import { resetDemoData } from "@/server/demo/reset";
import { createTestDb } from "./test-db";

// Фильтры «только своё» для MASTER на настоящих демо-данных.

let db: PrismaClient;
let master: StaffUser;
let admin: StaffUser;

beforeAll(async () => {
  db = createTestDb();
  await resetDemoData(db, {
    now: new Date("2026-11-03T11:30:00Z"),
    passwords: {
      owner: "owner-test-password",
      admin: "admin-test-password",
      master: "master-test-password",
    },
  });
  const card = await db.master.findUniqueOrThrow({
    where: { userId: "demo-user-master" },
  });
  master = {
    id: "demo-user-master",
    name: "Артём Соколов",
    email: "master@demo.ru",
    role: "MASTER",
    masterId: card.id,
  };
  admin = {
    id: "demo-user-admin",
    name: "Мария Лебедева",
    email: "admin@demo.ru",
    role: "ADMIN",
    masterId: null,
  };
});

afterAll(async () => {
  await db.$disconnect();
});

describe("MASTER scope", () => {
  it("returns only the master's own bookings", async () => {
    const own = await db.booking.findMany({
      where: bookingScope(master),
      select: { masterId: true },
    });
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((b) => b.masterId === master.masterId)).toBe(true);
    expect(own.length).toBeLessThan(await db.booking.count());
  });

  it("returns only clients who booked this master", async () => {
    const clients = await db.client.findMany({
      where: clientScope(master),
      select: { bookings: { select: { masterId: true } } },
    });
    expect(clients.length).toBeGreaterThan(0);
    expect(clients.length).toBeLessThan(await db.client.count());
    for (const client of clients) {
      expect(client.bookings.some((b) => b.masterId === master.masterId)).toBe(
        true,
      );
    }
  });

  it("returns only the master's own card", async () => {
    const cards = await db.master.findMany({ where: masterScope(master) });
    expect(cards.map((card) => card.id)).toEqual([master.masterId]);
  });
});

describe("ADMIN scope", () => {
  it("is not restricted", async () => {
    expect(await db.booking.count({ where: bookingScope(admin) })).toBe(
      await db.booking.count(),
    );
    expect(await db.client.count({ where: clientScope(admin) })).toBe(
      await db.client.count(),
    );
  });
});
