import "server-only";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { connection } from "next/server";
import { env } from "@/env";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { canAccess, LOGIN_PATH, type StaffUser } from "./access";
import { createAuth } from "./config";

export const auth = createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.APP_URL,
  demoMode: env.DEMO_MODE,
});

/**
 * Текущий сотрудник или null, если сессии нет или учётка отключена.
 *
 * `use cache: private`: layout и страница одного запроса делят один поход в БД,
 * а переходы по админке не ждут сервер (DESIGN.md, раздел 4). На сервере результат
 * между запросами не хранится, поэтому Server Actions всегда видят свежую сессию.
 */
export async function getCurrentStaff(): Promise<StaffUser | null> {
  "use cache: private";
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user.isActive) return null;

  const { id, name, email, role } = session.user;
  const master =
    role === "MASTER"
      ? await db.master.findUnique({
          where: { userId: id },
          select: { id: true },
        })
      : null;
  return { id, name, email, role, masterId: master?.id ?? null };
}

/**
 * Проверка доступа для страниц и Server Actions: без сессии — на страницу входа,
 * без нужной роли — 403. Скрытие кнопок в UI защитой не считается (DESIGN.md, раздел 4).
 */
export async function requireRole(
  ...roles: readonly Role[]
): Promise<StaffUser> {
  // Всё, что за проверкой роли, зависит от сессии и рендерится в момент запроса.
  // connection() говорит об этом Next.js явно: иначе чтение БД (Prisma внутри
  // вызывает crypto.getRandomValues) и new Date() после закэшированной сессии
  // считались бы «нестабильными значениями при пререндере».
  await connection();
  const staff = await getCurrentStaff();
  if (!staff) redirect(LOGIN_PATH);
  if (!canAccess(staff, roles)) forbidden();
  return staff;
}
