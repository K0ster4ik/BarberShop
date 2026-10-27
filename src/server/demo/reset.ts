import { hashPassword } from "better-auth/crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { DEMO_USERS, type DemoUserKey } from "./catalog";
import { generateDemoData } from "./generate";

// Сброс демо (DESIGN.md, раздел 13). Используется сидом и cron-эндпоинтом.
// Модуль не импортирует `server-only` и `@/server/db`, чтобы его мог запускать сид через tsx;
// клиент БД передаётся параметром.

export type DemoPasswords = Record<DemoUserKey, string>;

export type DemoResetSummary = {
  clients: number;
  bookings: number;
  payments: number;
};

const DEMO_USER_IDS = DEMO_USERS.map((user) => user.id);

/** Удаляет все бизнес-данные; порядок учитывает внешние ключи с ON DELETE RESTRICT. */
export async function clearBusinessData(
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.notification.deleteMany();
  await tx.payment.deleteMany();
  await tx.bookingItem.deleteMany();
  await tx.booking.deleteMany();
  await tx.clientNote.deleteMany();
  await tx.clientTag.deleteMany();
  await tx.tag.deleteMany();
  await tx.client.deleteMany();
  await tx.promoCode.deleteMany();
  await tx.masterPromotion.deleteMany();
  await tx.masterService.deleteMany();
  await tx.workingHours.deleteMany();
  await tx.timeOff.deleteMany();
  await tx.service.deleteMany();
  await tx.serviceCategory.deleteMany();
  await tx.master.deleteMany();
}

/**
 * Возвращает БД к исходному демо-состоянию за одну транзакцию: пока она идёт,
 * читатели видят старые данные. Демо-пользователи пересоздаются с теми же ID,
 * поэтому их сессии переживают сброс; остальные пользователи удаляются.
 */
export async function resetDemoData(
  db: PrismaClient,
  options: { passwords: DemoPasswords; now?: Date },
): Promise<DemoResetSummary> {
  const data = generateDemoData({ now: options.now ?? new Date() });

  // scrypt медленный — считаем до транзакции, чтобы не держать её открытой.
  const passwordHashes = new Map(
    await Promise.all(
      DEMO_USERS.map(
        async (user) =>
          [user.key, await hashPassword(options.passwords[user.key])] as const,
      ),
    ),
  );

  await db.$transaction(
    async (tx) => {
      await clearBusinessData(tx);
      await tx.user.deleteMany({ where: { id: { notIn: DEMO_USER_IDS } } });

      for (const user of DEMO_USERS) {
        const profile = {
          name: user.name,
          email: user.email,
          emailVerified: true,
          role: user.role,
          isActive: true,
        };
        await tx.user.upsert({
          where: { id: user.id },
          create: { id: user.id, ...profile },
          update: profile,
        });

        const password = passwordHashes.get(user.key);
        const accountId = `${user.id}-credential`;
        await tx.account.deleteMany({
          where: { userId: user.id, id: { not: accountId } },
        });
        await tx.account.upsert({
          where: { id: accountId },
          create: {
            id: accountId,
            userId: user.id,
            accountId: user.id,
            providerId: "credential",
            password,
          },
          update: { password },
        });
      }

      await tx.serviceCategory.createMany({ data: data.categories });
      await tx.service.createMany({ data: data.services });
      await tx.master.createMany({ data: data.masters });
      await tx.masterService.createMany({ data: data.masterServices });
      await tx.workingHours.createMany({ data: data.workingHours });
      await tx.timeOff.createMany({ data: data.timeOffs });
      await tx.masterPromotion.createMany({ data: data.promotions });
      await tx.promoCode.createMany({ data: data.promoCodes });
      await tx.tag.createMany({ data: data.tags });
      await tx.client.createMany({ data: data.clients });
      await tx.clientTag.createMany({ data: data.clientTags });
      await tx.clientNote.createMany({ data: data.clientNotes });
      await tx.booking.createMany({ data: data.bookings });
      await tx.bookingItem.createMany({ data: data.bookingItems });
      await tx.payment.createMany({ data: data.payments });
    },
    { maxWait: 10_000, timeout: 120_000 },
  );

  return {
    clients: data.clients.length,
    bookings: data.bookings.length,
    payments: data.payments.length,
  };
}
