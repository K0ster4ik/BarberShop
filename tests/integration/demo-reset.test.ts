import { verifyPassword } from "better-auth/crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { DEMO_USERS } from "@/server/demo/catalog";
import { resetDemoData } from "@/server/demo/reset";
import { createTestDb } from "./test-db";

const passwords = {
  owner: "owner-test-password",
  admin: "admin-test-password",
  master: "master-test-password",
};
const now = new Date("2026-11-03T11:30:00Z");

let db: PrismaClient;

beforeAll(() => {
  db = createTestDb();
});

afterAll(async () => {
  await db.$disconnect();
});

async function snapshot() {
  const [bookings, clients, payments, masters, users] = await Promise.all([
    db.booking.findMany({
      select: { id: true, status: true, totalPrice: true },
      orderBy: { id: "asc" },
    }),
    db.client.count(),
    db.payment.aggregate({ _sum: { amount: true }, _count: true }),
    db.master.findMany({
      select: { id: true, userId: true },
      orderBy: { id: "asc" },
    }),
    db.user.findMany({
      select: { id: true, role: true },
      orderBy: { id: "asc" },
    }),
  ]);
  return { bookings, clients, payments, masters, users };
}

describe("resetDemoData", () => {
  it("restores the same demo state and keeps demo sessions alive", async () => {
    // Сессии переживают сброс, поэтому убираем оставшиеся от прошлого запуска тестов.
    await db.session.deleteMany();
    await resetDemoData(db, { now, passwords });
    const initial = await snapshot();
    expect(initial.bookings.length).toBeGreaterThan(1000);
    expect(initial.users.map((u) => u.id)).toEqual(
      DEMO_USERS.map((u) => u.id).toSorted(),
    );

    // Что успевает натворить посетитель между сбросами.
    await db.session.create({
      data: {
        id: "owner-session",
        token: "owner-session-token",
        userId: "demo-user-owner",
        expiresAt: new Date(now.getTime() + 86_400_000),
      },
    });
    await db.user.create({
      data: {
        id: "visitor-user",
        name: "Посетитель",
        email: "visitor@example.com",
      },
    });
    await db.booking.updateMany({ data: { clientComment: "мусор" } });
    await db.client.deleteMany({ where: { bookings: { none: {} } } });

    await resetDemoData(db, { now, passwords });

    expect(await snapshot()).toEqual(initial);
    expect(await db.booking.count({ where: { clientComment: "мусор" } })).toBe(
      0,
    );
    expect(
      await db.user.findUnique({ where: { id: "visitor-user" } }),
    ).toBeNull();
    expect(
      await db.session.findUnique({ where: { id: "owner-session" } }),
    ).not.toBeNull();
  });

  it("sets demo passwords that Better Auth can verify", async () => {
    await resetDemoData(db, { now, passwords });
    const accounts = await db.account.findMany({
      where: { providerId: "credential" },
    });
    expect(accounts).toHaveLength(DEMO_USERS.length);

    const owner = accounts.find((a) => a.userId === "demo-user-owner");
    expect(
      await verifyPassword({
        hash: owner?.password ?? "",
        password: passwords.owner,
      }),
    ).toBe(true);
  });
});
