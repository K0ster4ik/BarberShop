import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { serviceSchema } from "@/lib/validation/catalog";
import { promoCodeSchema } from "@/lib/validation/promo-codes";
import {
  createCategory,
  createService,
  deleteCategory,
  updateCategory,
  updateService,
} from "@/server/catalog/service";
import { DomainError } from "@/server/errors";
import {
  createPromoCode,
  deletePromoCode,
  listPromoCodes,
} from "@/server/promo-codes/service";
import { seedDemo } from "./fixtures";
import { createTestDb } from "./test-db";

let db: PrismaClient;

beforeAll(() => {
  db = createTestDb();
});
afterAll(async () => {
  await db.$disconnect();
});
beforeEach(async () => {
  await seedDemo(db);
});

async function domainError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(DomainError);
  return error as DomainError;
}

describe("categories", () => {
  it("rejects a duplicate name regardless of case", async () => {
    const error = await domainError(
      createCategory(db, { name: "стрижки", sortOrder: 9 }),
    );
    expect(error.field).toBe("name");
  });

  it("allows renaming a category to its own name", async () => {
    const category = await db.serviceCategory.findFirstOrThrow();
    await expect(
      updateCategory(db, category.id, { name: category.name, sortOrder: 5 }),
    ).resolves.toMatchObject({ sortOrder: 5 });
  });

  it("refuses to delete a category that still has services", async () => {
    const category = await db.serviceCategory.findFirstOrThrow({
      where: { services: { some: {} } },
    });
    await domainError(deleteCategory(db, category.id));
    const empty = await createCategory(db, { name: "Уход", sortOrder: 9 });
    await deleteCategory(db, empty.id);
    expect(
      await db.serviceCategory.findUnique({ where: { id: empty.id } }),
    ).toBeNull();
  });
});

describe("services", () => {
  it("stores prices in kopecks and empty fields as null", async () => {
    const category = await db.serviceCategory.findFirstOrThrow();
    const input = serviceSchema.parse({
      categoryId: category.id,
      name: "Укладка",
      description: "  ",
      durationMin: 20,
      priceRub: 650.5,
      bufferMin: null,
      isActive: true,
      sortOrder: 0,
    });
    const service = await createService(db, input);
    expect(service).toMatchObject({
      price: 65_050,
      description: null,
      bufferMin: null,
    });
  });

  it("rejects an unknown category", async () => {
    const service = await db.service.findFirstOrThrow();
    const error = await domainError(
      updateService(db, service.id, {
        categoryId: "no-such-category",
        name: service.name,
        description: "",
        durationMin: service.durationMin,
        priceRub: 100,
        bufferMin: null,
        isActive: true,
        sortOrder: 0,
      }),
    );
    expect(error.field).toBe("categoryId");
  });
});

describe("promo codes", () => {
  it("counts uses from non-cancelled bookings", async () => {
    const codes = await listPromoCodes(db);
    const welcome = codes.find((code) => code.code === "WELCOME10");
    expect(welcome?.uses).toBeGreaterThan(0);
  });

  it("normalises the code and rejects duplicates", async () => {
    const input = promoCodeSchema.parse({
      code: " welcome10 ",
      kind: "PERCENT",
      value: 5,
      validFrom: "",
      validUntil: "",
      maxUses: null,
      isActive: true,
    });
    expect(input.code).toBe("WELCOME10");
    const error = await domainError(createPromoCode(db, input));
    expect(error.field).toBe("code");
  });

  it("deletes only unused codes", async () => {
    const used = await db.promoCode.findUniqueOrThrow({
      where: { code: "WELCOME10" },
    });
    await domainError(deletePromoCode(db, used.id));

    const fresh = await createPromoCode(
      db,
      promoCodeSchema.parse({
        code: "NEW300",
        kind: "AMOUNT",
        value: 300,
        validFrom: "2026-11-01",
        validUntil: "2026-11-30",
        maxUses: 10,
        isActive: true,
      }),
    );
    expect(fresh.value).toBe(30_000);
    await deletePromoCode(db, fresh.id);
    expect(
      await db.promoCode.findUnique({ where: { id: fresh.id } }),
    ).toBeNull();
  });
});
