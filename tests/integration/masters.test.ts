import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { addDays, salonTimeToInstant, toSalonDate } from "@/lib/time";
import { promotionSchema, timeOffSchema } from "@/lib/validation/masters";
import { ForbiddenError, type StaffUser } from "@/server/auth/access";
import { discountToForm } from "@/server/discount-input";
import { DomainError } from "@/server/errors";
import {
  createPromotion,
  createTimeOff,
  deletePromotion,
  deleteTimeOff,
  listMasters,
  replaceWeekSchedule,
  setMasterPhoto,
  upsertMasterService,
} from "@/server/masters/service";
import { seedDemo, TEST_NOW } from "./fixtures";
import { createTestDb } from "./test-db";

let db: PrismaClient;
let owner: StaffUser;
let master: StaffUser;
let ownMasterId: string;
let otherMasterId: string;
let uploadsDir: string;

beforeAll(async () => {
  db = createTestDb();
  uploadsDir = await mkdtemp(path.join(tmpdir(), "barbershop-uploads-"));
});
afterAll(async () => {
  await db.$disconnect();
  await rm(uploadsDir, { recursive: true, force: true });
});
beforeEach(async () => {
  ({ owner, master, ownMasterId, otherMasterId } = await seedDemo(
    db,
    uploadsDir,
  ));
});

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (reason: unknown) => reason,
  );
}

const promotion = (overrides: Partial<Record<string, unknown>> = {}) =>
  promotionSchema.parse({
    title: "Скидка недели",
    serviceId: "",
    kind: "PERCENT",
    value: 15,
    validFrom: "",
    validUntil: "",
    isActive: true,
    ...overrides,
  });

describe("master scope", () => {
  it("lists only the master's own card for MASTER", async () => {
    expect((await listMasters(db, master)).map((m) => m.id)).toEqual([
      ownMasterId,
    ]);
    expect(await listMasters(db, owner)).toHaveLength(4);
  });

  it("lets a master change only their own prices", async () => {
    const service = await db.service.findFirstOrThrow();
    const input = { serviceId: service.id, priceRub: 2500, durationMin: 50 };
    expect(
      await rejection(upsertMasterService(db, master, otherMasterId, input)),
    ).toBeInstanceOf(ForbiddenError);

    const saved = await upsertMasterService(db, master, ownMasterId, input);
    expect(saved).toMatchObject({ price: 250_000, durationMin: 50 });
  });
});

describe("promotions", () => {
  it("accepts only services the master offers", async () => {
    const notOffered = await db.service.findFirstOrThrow({
      where: { masters: { none: { masterId: ownMasterId } } },
    });
    const error = await rejection(
      createPromotion(
        db,
        master,
        ownMasterId,
        promotion({ serviceId: notOffered.id }),
      ),
    );
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).field).toBe("serviceId");
  });

  it("stores amounts in kopecks and the end date as the next salon midnight", async () => {
    const created = await createPromotion(
      db,
      master,
      ownMasterId,
      promotion({
        kind: "AMOUNT",
        value: 300,
        validFrom: "2026-11-10",
        validUntil: "2026-11-20",
      }),
    );
    expect(created.value).toBe(30_000);
    expect(created.createdById).toBe(master.id);
    expect(created.validFrom).toEqual(salonTimeToInstant("2026-11-10", 0));
    expect(created.validUntil).toEqual(salonTimeToInstant("2026-11-21", 0));
    // и обратно в форму — те же даты «с … по …»
    expect(discountToForm(created)).toMatchObject({
      value: 300,
      validFrom: "2026-11-10",
      validUntil: "2026-11-20",
    });
  });

  it("does not let a master delete another master's promotion", async () => {
    const foreign = await createPromotion(
      db,
      owner,
      otherMasterId,
      promotion(),
    );
    expect(
      await rejection(deletePromotion(db, master, foreign.id)),
    ).toBeInstanceOf(ForbiddenError);
  });
});

describe("schedule and time off", () => {
  it("replaces the week and reports upcoming bookings left outside", async () => {
    const upcoming = await db.booking.count({
      where: {
        masterId: ownMasterId,
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { gte: TEST_NOW },
        deletedAt: null,
      },
    });
    expect(upcoming).toBeGreaterThan(0);

    const dayOff = { days: Array.from({ length: 7 }, () => []) };
    const result = await replaceWeekSchedule(
      db,
      master,
      ownMasterId,
      dayOff,
      TEST_NOW,
    );
    expect(result.outside).toBe(upcoming);
    expect(
      await db.workingHours.count({ where: { masterId: ownMasterId } }),
    ).toBe(0);
  });

  it("creates a full-day time off at salon midnights and counts conflicts", async () => {
    const tomorrow = addDays(toSalonDate(TEST_NOW), 1);
    const busy = await db.booking.findFirstOrThrow({
      where: {
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: {
          gte: salonTimeToInstant(tomorrow, 0),
          lt: salonTimeToInstant(tomorrow, 1440),
        },
      },
    });
    const input = timeOffSchema.parse({
      allDay: true,
      fromDate: tomorrow,
      fromTime: "",
      toDate: tomorrow,
      toTime: "",
      reason: "Больничный",
    });
    const { conflicts } = await createTimeOff(db, owner, busy.masterId, input);
    expect(conflicts).toBeGreaterThan(0);

    const created = await db.timeOff.findFirstOrThrow({
      where: { masterId: busy.masterId, reason: "Больничный" },
    });
    expect(created.startsAt).toEqual(salonTimeToInstant(tomorrow, 0));
    expect(created.endsAt).toEqual(salonTimeToInstant(addDays(tomorrow, 1), 0));
  });

  it("does not let a master delete another master's time off", async () => {
    const input = timeOffSchema.parse({
      allDay: false,
      fromDate: "2026-11-20",
      fromTime: "13:00",
      toDate: "2026-11-20",
      toTime: "14:00",
      reason: "",
    });
    await createTimeOff(db, owner, otherMasterId, input);
    const foreign = await db.timeOff.findFirstOrThrow({
      where: {
        masterId: otherMasterId,
        startsAt: salonTimeToInstant("2026-11-20", 780),
      },
    });
    expect(
      await rejection(deleteTimeOff(db, master, foreign.id)),
    ).toBeInstanceOf(ForbiddenError);
  });
});

describe("master photo", () => {
  it("converts the upload to an 800×1000 WebP and removes the old file", async () => {
    const before = await db.master.findUniqueOrThrow({
      where: { id: ownMasterId },
    });
    const upload = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: "#884422" },
    })
      .jpeg()
      .toBuffer();

    const photoPath = await setMasterPhoto(db, uploadsDir, ownMasterId, upload);
    expect(photoPath).toMatch(/^masters\/[a-z0-9]+-[0-9a-f]{8}\.webp$/);

    // Через буфер: открытый по пути файл libvips держит в кэше, и на Windows
    // следующий сброс демо не смог бы его удалить (EBUSY).
    const stored = await sharp(
      await readFile(path.join(uploadsDir, photoPath)),
    ).metadata();
    expect(stored).toMatchObject({ format: "webp", width: 800, height: 1000 });
    const files = await readdir(path.join(uploadsDir, "masters"));
    expect(files).not.toContain(path.basename(before.photoPath ?? "missing"));
  });

  it("rejects a file that is not an image", async () => {
    const error = await rejection(
      setMasterPhoto(db, uploadsDir, ownMasterId, Buffer.from("not an image")),
    );
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).field).toBe("photo");
  });
});
