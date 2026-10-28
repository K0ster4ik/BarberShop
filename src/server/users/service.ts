import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import type {
  PasswordResetInput,
  UserCreateInput,
  UserUpdateInput,
} from "@/lib/validation/users";
import type { StaffUser } from "@/server/auth/access";
import { isDemoUser } from "@/server/demo/catalog";
import { type Db, DomainError } from "@/server/errors";

// Сотрудники с доступом в CRM. Раздел только для OWNER (DESIGN.md, раздел 4).
// Пароли хэшируются так же, как это делает Better Auth (scrypt из better-auth/crypto).

export type UsersOptions = { demoMode: boolean };

/** Ключ pg_advisory_xact_lock для изменений сотрудников. */
const USERS_LOCK_KEY = 4_100_001;

export const DEMO_USER_LOCKED_MESSAGE =
  "Демо-учётки нельзя изменять: ими пользуются все посетители демо.";

function assertNotDemoLocked(options: UsersOptions, userId: string) {
  if (options.demoMode && isDemoUser(userId)) {
    throw new DomainError(DEMO_USER_LOCKED_MESSAGE);
  }
}

export async function listUsers(db: Db) {
  const [users, masters] = await Promise.all([
    db.user.findMany({
      orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        master: { select: { id: true, name: true } },
      },
    }),
    db.master.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, userId: true },
    }),
  ]);
  return { users, masters };
}

/**
 * Привязывает карточку мастера, только если она свободна или уже принадлежит этому
 * пользователю. Условие проверяется в самом UPDATE: из двух параллельных запросов
 * второй дождётся первого и не найдёт свободной карточки.
 */
async function linkMaster(db: Db, masterId: string, userId: string) {
  const linked = await db.master.updateMany({
    where: { id: masterId, OR: [{ userId: null }, { userId }] },
    data: { userId },
  });
  if (linked.count === 1) return;
  const exists = await db.master.count({ where: { id: masterId } });
  throw new DomainError(
    exists
      ? "К этой карточке уже привязан другой сотрудник"
      : "Карточка мастера не найдена",
    "masterId",
  );
}

export async function createUser(
  db: PrismaClient,
  input: UserCreateInput,
): Promise<{ id: string }> {
  const taken = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (taken) throw new DomainError("Сотрудник с таким email уже есть", "email");

  const id = randomUUID();
  const password = await hashPassword(input.password);
  await db.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        id,
        name: input.name,
        email: input.email,
        emailVerified: true,
        role: input.role,
        accounts: {
          create: {
            id: `${id}-credential`,
            accountId: id,
            providerId: "credential",
            password,
          },
        },
      },
    });
    if (input.role === "MASTER") await linkMaster(tx, input.masterId, id);
  });
  return { id };
}

/** Последний активный владелец не может перестать им быть — иначе салон без владельца. */
async function assertOtherActiveOwner(db: Db, userId: string) {
  const others = await db.user.count({
    where: { role: "OWNER", isActive: true, id: { not: userId } },
  });
  if (others === 0) {
    throw new DomainError(
      "В салоне должен остаться хотя бы один активный владелец",
    );
  }
}

export async function updateUser(
  db: PrismaClient,
  options: UsersOptions,
  actor: StaffUser,
  userId: string,
  input: UserUpdateInput,
) {
  assertNotDemoLocked(options, userId);
  await db.$transaction(async (tx) => {
    // Изменения сотрудников идут по одному: иначе два владельца могли бы одновременно
    // отключить друг друга, и каждый увидел бы второго ещё активным.
    // Блокировка снимается в конце транзакции.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${USERS_LOCK_KEY})`;
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true },
    });
    if (!user) throw new DomainError("Сотрудник не найден");

    if (userId === actor.id) {
      if (input.role !== user.role) {
        throw new DomainError("Нельзя изменить собственную роль", "role");
      }
      if (!input.isActive) {
        throw new DomainError(
          "Нельзя отключить собственную учётную запись",
          "isActive",
        );
      }
    }
    const losesOwner =
      user.role === "OWNER" &&
      user.isActive &&
      (input.role !== "OWNER" || !input.isActive);
    if (losesOwner) await assertOtherActiveOwner(tx, userId);

    await tx.user.update({
      where: { id: userId },
      data: { name: input.name, role: input.role, isActive: input.isActive },
    });
    // Привязка к карточке мастера: снимаем старую и ставим новую при необходимости.
    await tx.master.updateMany({
      where: {
        userId,
        ...(input.role === "MASTER" ? { id: { not: input.masterId } } : {}),
      },
      data: { userId: null },
    });
    if (input.role === "MASTER") await linkMaster(tx, input.masterId, userId);
    // Отключённый сотрудник выходит отовсюду сразу, а не по истечении сессии.
    if (!input.isActive) {
      await tx.session.deleteMany({ where: { userId } });
    }
  });
}

/** Новый пароль задаёт владелец; все сессии сотрудника завершаются. */
export async function resetUserPassword(
  db: PrismaClient,
  options: UsersOptions,
  userId: string,
  input: PasswordResetInput,
) {
  assertNotDemoLocked(options, userId);
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) throw new DomainError("Сотрудник не найден");

  const password = await hashPassword(input.password);
  await db.$transaction(async (tx) => {
    const updated = await tx.account.updateMany({
      where: { userId, providerId: "credential" },
      data: { password },
    });
    if (updated.count === 0) {
      await tx.account.create({
        data: {
          id: `${userId}-credential`,
          userId,
          accountId: userId,
          providerId: "credential",
          password,
        },
      });
    }
    await tx.session.deleteMany({ where: { userId } });
  });
}
