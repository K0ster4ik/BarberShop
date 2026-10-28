import { isAPIError } from "better-auth/api";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { userCreateSchema } from "@/lib/validation/users";
import type { StaffUser } from "@/server/auth/access";
import { type Auth, createAuth } from "@/server/auth/config";
import { DomainError } from "@/server/errors";
import {
  createUser,
  DEMO_USER_LOCKED_MESSAGE,
  resetUserPassword,
  updateUser,
} from "@/server/users/service";
import { seedDemo } from "./fixtures";
import { createTestDb } from "./test-db";

let db: PrismaClient;
let auth: Auth;
let owner: StaffUser;
let freeMasterId: string;

const demoOn = { demoMode: true };
const demoOff = { demoMode: false };

beforeAll(() => {
  db = createTestDb();
  auth = createAuth({
    db,
    secret: "integration-test-secret-0123456789abcdef",
    baseURL: "http://localhost:3000",
    demoMode: true,
  });
});
afterAll(async () => {
  await db.$disconnect();
});
beforeEach(async () => {
  ({ owner } = await seedDemo(db));
  const free = await db.master.findFirstOrThrow({ where: { userId: null } });
  freeMasterId = free.id;
});

async function domainError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(DomainError);
  return error as DomainError;
}

const newUser = (overrides: Partial<Record<string, string>> = {}) =>
  userCreateSchema.parse({
    name: "Новый администратор",
    email: "New.Admin@Example.com",
    role: "ADMIN",
    password: "new-admin-password",
    masterId: "",
    ...overrides,
  });

describe("createUser", () => {
  it("creates a staff member who can sign in", async () => {
    const { id } = await createUser(db, newUser());
    const user = await db.user.findUniqueOrThrow({ where: { id } });
    expect(user.email).toBe("new.admin@example.com");

    const session = await auth.api.signInEmail({
      body: { email: "new.admin@example.com", password: "new-admin-password" },
    });
    expect(session.user.id).toBe(id);
  });

  it("links a MASTER to a free master card and refuses a taken one", async () => {
    const { id } = await createUser(
      db,
      newUser({
        email: "m2@example.com",
        role: "MASTER",
        masterId: freeMasterId,
      }),
    );
    expect(
      (await db.master.findUniqueOrThrow({ where: { id: freeMasterId } }))
        .userId,
    ).toBe(id);

    const error = await domainError(
      createUser(
        db,
        newUser({
          email: "m3@example.com",
          role: "MASTER",
          masterId: freeMasterId,
        }),
      ),
    );
    expect(error.field).toBe("masterId");
  });

  it("gives a free master card to only one of two parallel requests", async () => {
    const results = await Promise.allSettled(
      ["race-1@example.com", "race-2@example.com"].map((email) =>
        createUser(
          db,
          newUser({ email, role: "MASTER", masterId: freeMasterId }),
        ),
      ),
    );
    const created = results.flatMap((r) =>
      r.status === "fulfilled" ? [r.value.id] : [],
    );
    expect(created).toHaveLength(1);
    expect(
      (await db.master.findUniqueOrThrow({ where: { id: freeMasterId } }))
        .userId,
    ).toBe(created[0]);
    // Проигравший запрос откатился целиком: сотрудника-мастера без карточки нет
    expect(
      await db.user.count({ where: { email: { startsWith: "race-" } } }),
    ).toBe(1);
  });

  it("rejects a duplicate email", async () => {
    const error = await domainError(
      createUser(db, newUser({ email: "owner@demo.ru" })),
    );
    expect(error.field).toBe("email");
  });
});

describe("updateUser", () => {
  it("keeps shared demo accounts locked in demo mode", async () => {
    const error = await domainError(
      updateUser(db, demoOn, owner, "demo-user-admin", {
        name: "Взлом",
        role: "OWNER",
        isActive: true,
        masterId: "",
      }),
    );
    expect(error.message).toBe(DEMO_USER_LOCKED_MESSAGE);
  });

  it("does not let an owner demote or disable themselves", async () => {
    await domainError(
      updateUser(db, demoOff, owner, owner.id, {
        name: owner.name,
        role: "ADMIN",
        isActive: true,
        masterId: "",
      }),
    );
    await domainError(
      updateUser(db, demoOff, owner, owner.id, {
        name: owner.name,
        role: "OWNER",
        isActive: false,
        masterId: "",
      }),
    );
  });

  it("keeps at least one active owner", async () => {
    const someone: StaffUser = { ...owner, id: "someone-else" };
    const error = await domainError(
      updateUser(db, demoOff, someone, owner.id, {
        name: owner.name,
        role: "ADMIN",
        isActive: true,
        masterId: "",
      }),
    );
    expect(error.message).toMatch(/владелец/);
  });

  it("does not let two owners disable each other at the same time", async () => {
    const { id } = await createUser(
      db,
      newUser({ email: "owner-2@example.com", role: "OWNER" }),
    );
    const second: StaffUser = { ...owner, id, name: "Второй владелец" };
    const disable = (actor: StaffUser, target: StaffUser) =>
      updateUser(db, demoOff, actor, target.id, {
        name: target.name,
        role: "OWNER",
        isActive: false,
        masterId: "",
      });

    const results = await Promise.allSettled([
      disable(owner, second),
      disable(second, owner),
    ]);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(
      await db.user.count({ where: { role: "OWNER", isActive: true } }),
    ).toBe(1);
  });

  it("signs a deactivated employee out everywhere", async () => {
    const { id } = await createUser(db, newUser({ email: "temp@example.com" }));
    await auth.api.signInEmail({
      body: { email: "temp@example.com", password: "new-admin-password" },
    });
    expect(await db.session.count({ where: { userId: id } })).toBe(1);

    await updateUser(db, demoOff, owner, id, {
      name: "Новый администратор",
      role: "ADMIN",
      isActive: false,
      masterId: "",
    });
    expect(await db.session.count({ where: { userId: id } })).toBe(0);
  });
});

describe("resetUserPassword", () => {
  it("sets a new password and ends existing sessions", async () => {
    const { id } = await createUser(
      db,
      newUser({ email: "reset@example.com" }),
    );
    await auth.api.signInEmail({
      body: { email: "reset@example.com", password: "new-admin-password" },
    });

    await resetUserPassword(db, demoOff, id, {
      password: "brand-new-password",
    });
    expect(await db.session.count({ where: { userId: id } })).toBe(0);

    const old = await auth.api
      .signInEmail({
        body: { email: "reset@example.com", password: "new-admin-password" },
      })
      .then(
        () => null,
        (reason: unknown) => reason,
      );
    expect(isAPIError(old) && old.statusCode).toBe(401);
    await expect(
      auth.api.signInEmail({
        body: { email: "reset@example.com", password: "brand-new-password" },
      }),
    ).resolves.toBeDefined();
  });

  it("refuses to change a demo account password in demo mode", async () => {
    await domainError(
      resetUserPassword(db, demoOn, "demo-user-master", {
        password: "hijacked-pass",
      }),
    );
  });
});
