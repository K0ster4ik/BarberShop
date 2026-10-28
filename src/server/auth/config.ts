import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import type { PrismaClient } from "@/generated/prisma/client";
import { isDemoUser } from "@/server/demo/catalog";

// Конфигурация Better Auth. Фабрика, а не готовый объект: интеграционные тесты
// собирают auth поверх тестовой БД. Рабочий экземпляр — в ./index.ts.

export const ACCOUNT_DISABLED_MESSAGE =
  "Учётная запись отключена. Обратитесь к владельцу салона.";
export const DEMO_LOCKED_MESSAGE =
  "В демо-режиме это действие для демо-учёток недоступно.";

/**
 * HTTP-эндпоинты Better Auth, которые приложению не нужны: регистрации нет
 * (сотрудников создаёт владелец), почты и OAuth тоже. Профиль меняется через
 * Server Actions приложения, а не через /update-user.
 *
 * Вход тоже идёт только через Server Action с собственным лимитом попыток
 * (src/app/admin/login/actions.ts). HTTP-вход закрыт, иначе через него можно было
 * бы подбирать пароль в обход этого лимита. disabledPaths действует только на
 * HTTP-роутер, серверный auth.api.signInEmail продолжает работать.
 */
const DISABLED_PATHS = [
  "/sign-in/email",
  "/sign-up/email",
  "/update-user",
  "/change-email",
  "/delete-user",
  "/request-password-reset",
  "/reset-password",
  "/send-verification-email",
  "/verify-email",
  "/link-social",
  "/unlink-account",
];

/**
 * В демо в общие учётки может войти кто угодно. Эти действия позволили бы
 * одному посетителю закрыть доступ остальным (DESIGN.md, раздел 10).
 */
const DEMO_LOCKED_PATHS = new Set([
  "/change-password",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
]);

export type AuthOptions = {
  db: PrismaClient;
  secret: string;
  baseURL: string;
  demoMode: boolean;
};

export function createAuth({ db, secret, baseURL, demoMode }: AuthOptions) {
  return betterAuth({
    appName: "Барбершоп",
    secret,
    baseURL,
    database: prismaAdapter(db, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
    },
    user: {
      additionalFields: {
        role: {
          type: ["OWNER", "ADMIN", "MASTER"],
          required: true,
          defaultValue: "ADMIN",
          input: false,
        },
        isActive: {
          type: "boolean",
          required: true,
          defaultValue: true,
          input: false,
        },
      },
    },
    disabledPaths: DISABLED_PATHS,
    databaseHooks: {
      session: {
        create: {
          // Отключённый сотрудник не получает новую сессию; уже выданные
          // отсекает getCurrentStaff по тому же флагу.
          before: async (session) => {
            const user = await db.user.findUnique({
              where: { id: session.userId },
              select: { isActive: true },
            });
            if (!user?.isActive) {
              throw new APIError("FORBIDDEN", {
                message: ACCOUNT_DISABLED_MESSAGE,
              });
            }
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!demoMode || !DEMO_LOCKED_PATHS.has(ctx.path)) return;
        const session = await getSessionFromCtx(ctx);
        if (session && isDemoUser(session.user.id)) {
          throw new APIError("FORBIDDEN", { message: DEMO_LOCKED_MESSAGE });
        }
      }),
    },
    // nextCookies должен быть последним: выставляет cookie из Server Actions.
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
