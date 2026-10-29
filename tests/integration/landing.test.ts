import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { loadFeaturedServices, loadMasterCards } from "@/server/site/landing";
import { seedDemo, TEST_NOW } from "./fixtures";
import { createTestDb } from "./test-db";

// Главная страница на демо-данных (DESIGN.md, раздел 11).

let db: PrismaClient;

beforeAll(async () => {
  db = createTestDb();
  await seedDemo(db);
});
afterAll(async () => {
  await db.$disconnect();
});

describe("landing data", () => {
  it("shows one service per category first", async () => {
    const services = await loadFeaturedServices(db, TEST_NOW);
    expect(services).toHaveLength(6);
    const firstRound = services.slice(0, 4).map((s) => s.categoryName);
    expect(new Set(firstRound).size).toBe(4);
  });

  it("gives every master who does the service a price and a nearest time", async () => {
    const [first] = await loadFeaturedServices(db, TEST_NOW, 1);
    const cards = await loadMasterCards(db, first?.id ?? null, TEST_NOW);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.offersService).toBe(true);
      expect(card.price).toBeGreaterThan(0);
    }
    expect(cards.some((card) => card.nearest !== null)).toBe(true);
  });

  it("does not call a master busy when they simply do not do the service", async () => {
    const [first] = await loadFeaturedServices(db, TEST_NOW, 1);
    const colorist = await db.master.create({
      data: { name: "Только Окрашивание", sortOrder: 99 },
    });
    try {
      const cards = await loadMasterCards(db, first?.id ?? null, TEST_NOW);
      expect(cards.find((card) => card.id === colorist.id)).toMatchObject({
        offersService: false,
        price: null,
        nearest: null,
      });
    } finally {
      await db.master.delete({ where: { id: colorist.id } });
    }
  });
});
