import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  ACCOUNT_DISABLED_MESSAGE,
  type Auth,
  createAuth,
  DEMO_LOCKED_MESSAGE,
} from "@/server/auth/config";
import { resetDemoData } from "@/server/demo/reset";
import { createTestDb } from "./test-db";

// Конфигурация Better Auth через её настоящий HTTP-обработчик (/api/auth/*):
// именно так до эндпоинтов доберётся посетитель демо.

const BASE_URL = "http://localhost:3000";
const SECRET = "integration-test-secret-0123456789abcdef";
const passwords = {
  owner: "owner-test-password",
  admin: "admin-test-password",
  master: "master-test-password",
};
const REGULAR = {
  id: "regular-admin",
  email: "regular@example.com",
  password: "regular-password",
};

let db: PrismaClient;
let auth: Auth;

function call(
  path: string,
  options: { body?: unknown; cookie?: string; auth?: Auth } = {},
) {
  return (options.auth ?? auth).handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: options.body === undefined ? "GET" : "POST",
      headers: {
        "content-type": "application/json",
        origin: BASE_URL,
        ...(options.cookie ? { cookie: options.cookie } : {}),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  );
}

async function signIn(email: string, password: string): Promise<string> {
  const response = await call("/sign-in/email", { body: { email, password } });
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

beforeAll(async () => {
  db = createTestDb();
  auth = createAuth({ db, secret: SECRET, baseURL: BASE_URL, demoMode: true });
  await resetDemoData(db, { passwords });
  await db.user.create({
    data: {
      id: REGULAR.id,
      name: "Обычный админ",
      email: REGULAR.email,
      role: "ADMIN",
      accounts: {
        create: {
          id: `${REGULAR.id}-credential`,
          accountId: REGULAR.id,
          providerId: "credential",
          password: await hashPassword(REGULAR.password),
        },
      },
    },
  });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("sign in", () => {
  it("signs a demo user in and exposes the role in the session", async () => {
    const cookie = await signIn("master@demo.ru", passwords.master);
    const response = await call("/get-session", { cookie });
    const session = (await response.json()) as {
      user: { id: string; role: string; isActive: boolean };
    };
    expect(session.user).toMatchObject({
      id: "demo-user-master",
      role: "MASTER",
      isActive: true,
    });
  });

  it("rejects a wrong password", async () => {
    const response = await call("/sign-in/email", {
      body: { email: "owner@demo.ru", password: "wrong-password" },
    });
    expect(response.status).toBe(401);
  });

  it("has self sign-up turned off", async () => {
    const response = await call("/sign-up/email", {
      body: {
        email: "intruder@example.com",
        password: "password123",
        name: "X",
      },
    });
    expect(response.ok).toBe(false);
    expect(
      await db.user.findUnique({ where: { email: "intruder@example.com" } }),
    ).toBeNull();
  });

  it("refuses a session to a deactivated employee", async () => {
    await db.user.update({
      where: { id: REGULAR.id },
      data: { isActive: false },
    });
    try {
      const response = await call("/sign-in/email", {
        body: { email: REGULAR.email, password: REGULAR.password },
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        message: ACCOUNT_DISABLED_MESSAGE,
      });
    } finally {
      await db.user.update({
        where: { id: REGULAR.id },
        data: { isActive: true },
      });
    }
  });

  it("does not let users promote themselves through the profile endpoint", async () => {
    const cookie = await signIn(REGULAR.email, REGULAR.password);
    const response = await call("/update-user", {
      cookie,
      body: { role: "OWNER" },
    });
    expect(response.ok).toBe(false);
    const user = await db.user.findUniqueOrThrow({ where: { id: REGULAR.id } });
    expect(user.role).toBe("ADMIN");
  });
});

describe("demo mode", () => {
  it.each([
    [
      "/change-password",
      { currentPassword: passwords.owner, newPassword: "hijacked-password" },
    ],
    ["/revoke-sessions", {}],
    ["/revoke-other-sessions", {}],
  ])("blocks %s for shared demo accounts", async (path, body) => {
    const cookie = await signIn("owner@demo.ru", passwords.owner);
    const response = await call(path, { cookie, body });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      message: DEMO_LOCKED_MESSAGE,
    });
  });

  it("keeps the demo password working after a blocked attempt", async () => {
    await expect(signIn("owner@demo.ru", passwords.owner)).resolves.toContain(
      "=",
    );
  });

  it("still lets regular staff change their own password", async () => {
    const cookie = await signIn(REGULAR.email, REGULAR.password);
    const newPassword = "regular-password-2";
    const response = await call("/change-password", {
      cookie,
      body: { currentPassword: REGULAR.password, newPassword },
    });
    expect(response.status).toBe(200);
    await expect(signIn(REGULAR.email, newPassword)).resolves.toContain("=");
  });

  it("does not restrict demo accounts when demo mode is off", async () => {
    const regularAuth = createAuth({
      db,
      secret: SECRET,
      baseURL: BASE_URL,
      demoMode: false,
    });
    const cookie = await signIn("owner@demo.ru", passwords.owner);
    const response = await call("/list-sessions", {
      cookie,
      auth: regularAuth,
    });
    expect(response.status).toBe(200);
  });
});
