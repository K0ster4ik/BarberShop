import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { clientProfileSchema } from "@/lib/validation/clients";
import { ForbiddenError, type StaffUser } from "@/server/auth/access";
import {
  getClientDetail,
  listClients,
  NEW_WITHIN_DAYS,
  SLEEPING_AFTER_DAYS,
} from "@/server/clients/queries";
import {
  addClientNote,
  CLIENT_NOT_FOUND,
  createTag,
  deleteClientNote,
  deleteTag,
  setClientDiscount,
  setClientTags,
  updateClientProfile,
} from "@/server/clients/service";
import { DomainError } from "@/server/errors";
import { seedDemo, TEST_NOW } from "./fixtures";
import { createTestDb } from "./test-db";

// Клиентская база в CRM (DESIGN.md, 8.1–8.2, раздел 4).

let db: PrismaClient;
let owner: StaffUser;
let master: StaffUser;
let ownMasterId: string;
let otherMasterId: string;
const admin: StaffUser = {
  id: "demo-user-admin",
  name: "Мария Лебедева",
  email: "admin@demo.ru",
  role: "ADMIN",
  masterId: null,
};
const DAY = 24 * 60 * 60_000;
const ALL = {
  query: "",
  tagId: null,
  masterId: null,
  segment: "all",
  page: 1,
} as const;

beforeAll(() => {
  db = createTestDb();
});
afterAll(async () => {
  await db.$disconnect();
});
beforeEach(async () => {
  ({ owner, master, ownMasterId, otherMasterId } = await seedDemo(db));
});

async function errorOf(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: unknown) => {
      if (error instanceof DomainError) return error.message;
      if (error instanceof ForbiddenError) return "forbidden";
      throw error;
    },
  );
}

/** Клиент, который ходил только к другому мастеру. */
async function foreignClient() {
  const client = await db.client.findFirst({
    where: {
      bookings: { some: { masterId: otherMasterId } },
      NOT: { bookings: { some: { masterId: ownMasterId } } },
    },
  });
  if (!client) throw new Error("No client of the other master only");
  return client;
}

/** Клиент, у которого есть визиты и к своему мастеру, и к другому. */
async function sharedClient() {
  const client = await db.client.findFirst({
    where: {
      AND: [
        { bookings: { some: { masterId: ownMasterId, status: "COMPLETED" } } },
        {
          bookings: { some: { masterId: otherMasterId, status: "COMPLETED" } },
        },
      ],
    },
  });
  if (!client) throw new Error("No shared client");
  return client;
}

describe("master scope", () => {
  it("lists only clients of the master's own bookings, whatever the filter says", async () => {
    const all = await listClients(db, master, { ...ALL, page: 1 }, TEST_NOW);
    const foreign = await foreignClient();
    const ownClients = await db.client.count({
      where: { bookings: { some: { masterId: ownMasterId, deletedAt: null } } },
    });
    expect(all.total).toBe(ownClients);
    const byOther = await listClients(
      db,
      master,
      { ...ALL, masterId: otherMasterId },
      TEST_NOW,
    );
    expect(byOther.total).toBe(0);
    expect(await getClientDetail(db, master, foreign.id, TEST_NOW)).toBeNull();
  });

  it("shows a master only their own visits and earnings of a shared client", async () => {
    const client = await sharedClient();
    const forMaster = await getClientDetail(db, master, client.id, TEST_NOW);
    const forOwner = await getClientDetail(db, owner, client.id, TEST_NOW);
    if (!forMaster || !forOwner) throw new Error("Client not visible");
    expect(forMaster.bookings.every((b) => b.master.id === ownMasterId)).toBe(
      true,
    );
    expect(forOwner.bookings.length).toBeGreaterThan(forMaster.bookings.length);
    const ownCompleted = await db.booking.count({
      where: {
        clientId: client.id,
        masterId: ownMasterId,
        status: "COMPLETED",
        deletedAt: null,
      },
    });
    expect(forMaster.stats.visits).toBe(ownCompleted);
  });
});

describe("listClients", () => {
  it("finds clients by name and by phone digits", async () => {
    const client = await db.client.findFirstOrThrow({
      orderBy: { name: "asc" },
    });
    const byName = await listClients(
      db,
      owner,
      { ...ALL, query: client.name.split(" ")[0]?.toLowerCase() ?? "" },
      TEST_NOW,
    );
    expect(byName.rows.map((row) => row.id)).toContain(client.id);
    const byPhone = await listClients(
      db,
      owner,
      { ...ALL, query: client.phone.slice(-7) },
      TEST_NOW,
    );
    expect(byPhone.rows.map((row) => row.id)).toContain(client.id);
  });

  it("finds sleeping clients: no visit for 45 days and nothing booked ahead", async () => {
    const sleeping = await listClients(
      db,
      owner,
      { ...ALL, segment: "sleeping" },
      TEST_NOW,
    );
    expect(sleeping.total).toBeGreaterThan(0);
    const since = new Date(TEST_NOW.getTime() - SLEEPING_AFTER_DAYS * DAY);
    for (const row of sleeping.rows) {
      expect(row.lastVisitAt).not.toBeNull();
      expect((row.lastVisitAt as Date) < since).toBe(true);
      expect(row.upcoming).toBe(0);
    }
  });

  it("finds new clients: the first visit within 30 days", async () => {
    const fresh = await listClients(
      db,
      owner,
      { ...ALL, segment: "new" },
      TEST_NOW,
    );
    expect(fresh.total).toBeGreaterThan(0);
    const since = new Date(TEST_NOW.getTime() - NEW_WITHIN_DAYS * DAY);
    for (const row of fresh.rows) {
      const first = await db.booking.findFirstOrThrow({
        where: { clientId: row.id, status: "COMPLETED", deletedAt: null },
        orderBy: { startsAt: "asc" },
      });
      expect(first.startsAt >= since).toBe(true);
    }
  });

  it("filters by tag", async () => {
    const vip = await db.tag.findUniqueOrThrow({ where: { name: "VIP" } });
    const tagged = await listClients(
      db,
      owner,
      { ...ALL, tagId: vip.id },
      TEST_NOW,
    );
    expect(tagged.total).toBe(
      await db.clientTag.count({ where: { tagId: vip.id } }),
    );
  });
});

describe("client card changes", () => {
  it("lets managers edit contacts and refuses a phone that belongs to another client", async () => {
    const [a, b] = await db.client.findMany({
      take: 2,
      orderBy: { id: "asc" },
    });
    if (!a || !b) throw new Error("Not enough clients");
    const input = clientProfileSchema.parse({
      name: "Новое Имя",
      phone: "+7 999 765-43-21",
      email: "A@Example.ru",
      birthday: "1990-05-17",
    });
    await updateClientProfile(db, admin, a.id, input);
    const saved = await db.client.findUniqueOrThrow({ where: { id: a.id } });
    expect(saved).toMatchObject({
      name: "Новое Имя",
      phone: "+79997654321",
      email: "a@example.ru",
    });
    expect(saved.birthday?.toISOString().slice(0, 10)).toBe("1990-05-17");
    expect(
      await errorOf(
        updateClientProfile(db, owner, b.id, {
          ...input,
          phone: "+79997654321",
        }),
      ),
    ).toBe("Клиент с таким телефоном уже есть");
    expect(await errorOf(updateClientProfile(db, master, a.id, input))).toBe(
      "forbidden",
    );
  });

  it("sets and clears the permanent discount; a master cannot", async () => {
    const client = await db.client.findFirstOrThrow();
    await setClientDiscount(db, owner, client.id, {
      enabled: true,
      kind: "AMOUNT",
      value: 150,
    });
    expect(
      await db.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).toMatchObject({
      discountKind: "AMOUNT",
      discountValue: 15_000,
    });
    await setClientDiscount(db, admin, client.id, {
      enabled: false,
      kind: "PERCENT",
      value: null,
    });
    expect(
      await db.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).toMatchObject({
      discountKind: null,
      discountValue: null,
    });
    expect(
      await errorOf(
        setClientDiscount(db, master, client.id, {
          enabled: true,
          kind: "PERCENT",
          value: 50,
        }),
      ),
    ).toBe("forbidden");
  });

  it("replaces tags, refuses duplicate tag names and removes a deleted tag everywhere", async () => {
    const client = await db.client.findFirstOrThrow();
    const { id: tagId } = await createTag(db, owner, {
      name: "Тестовый",
      color: "sky",
    });
    expect(
      await errorOf(createTag(db, admin, { name: "Тестовый", color: "rose" })),
    ).toBe("Такой тег уже есть");
    await setClientTags(db, owner, client.id, [tagId]);
    expect(
      await db.clientTag.findMany({ where: { clientId: client.id } }),
    ).toEqual([{ clientId: client.id, tagId }]);
    expect(await errorOf(setClientTags(db, master, client.id, []))).toBe(
      "forbidden",
    );
    await deleteTag(db, admin, tagId);
    expect(await db.clientTag.count({ where: { clientId: client.id } })).toBe(
      0,
    );
  });

  it("keeps one of two tag sets saved at the same time, not their union", async () => {
    const client = await db.client.findFirstOrThrow();
    const { id: a } = await createTag(db, owner, {
      name: "Гонка А",
      color: "sky",
    });
    const { id: b } = await createTag(db, owner, {
      name: "Гонка Б",
      color: "rose",
    });
    await setClientTags(db, owner, client.id, []);
    await Promise.all([
      setClientTags(db, owner, client.id, [a]),
      setClientTags(db, admin, client.id, [b]),
    ]);
    const saved = await db.clientTag.findMany({
      where: { clientId: client.id },
    });
    expect(saved).toHaveLength(1);
  });

  it("refuses a birthday in the future", () => {
    const tomorrow = new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10);
    const result = clientProfileSchema.safeParse({
      name: "Имя Фамилия",
      phone: "+7 999 765-43-21",
      email: "",
      birthday: tomorrow,
    });
    expect(result.success).toBe(false);
  });

  it("lets a master write notes about own clients only and delete only their own", async () => {
    const own = await db.client.findFirstOrThrow({
      where: { bookings: { some: { masterId: ownMasterId } } },
    });
    const foreign = await foreignClient();
    expect(
      await errorOf(addClientNote(db, master, foreign.id, { text: "Чужой" })),
    ).toBe(CLIENT_NOT_FOUND);
    await addClientNote(db, admin, own.id, { text: "От админа" });
    await addClientNote(db, master, own.id, { text: "От мастера" });
    const notes = await db.clientNote.findMany({
      where: { clientId: own.id, text: { in: ["От админа", "От мастера"] } },
    });
    const byAdmin = notes.find((note) => note.text === "От админа");
    const byMaster = notes.find((note) => note.text === "От мастера");
    if (!byAdmin || !byMaster) throw new Error("Notes were not created");
    expect(byMaster.authorId).toBe(master.id);
    expect(await errorOf(deleteClientNote(db, master, byAdmin.id))).toBe(
      "forbidden",
    );
    await deleteClientNote(db, master, byMaster.id);
    await deleteClientNote(db, owner, byAdmin.id);
    expect(
      await db.clientNote.count({
        where: { id: { in: [byAdmin.id, byMaster.id] } },
      }),
    ).toBe(0);
  });
});
