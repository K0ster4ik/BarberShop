import type { PrismaClient } from "@/generated/prisma/client";
import { formatNotification } from "./format";

// Outbox (DESIGN.md, раздел 9): уведомление создаётся в одной транзакции с записью или
// отменой, а отправляется после коммита. Неудачные попытки повторяет cron.

export const MAX_ATTEMPTS = 10;
const BATCH = 20;

export type SendMessage = (text: string) => Promise<void>;

/**
 * Отправляет неотправленные уведомления (или только `ids`). Каждое — в своей транзакции
 * с блокировкой строки: если одновременно работают отправка после записи и cron,
 * второй пропустит уже взятое (SKIP LOCKED), и сообщение не уйдёт дважды.
 */
export async function deliverNotifications(
  db: PrismaClient,
  send: SendMessage,
  options: { ids?: readonly string[] } = {},
): Promise<{ sent: number; failed: number }> {
  const pending = await db.notification.findMany({
    where: {
      sentAt: null,
      attempts: { lt: MAX_ATTEMPTS },
      ...(options.ids ? { id: { in: [...options.ids] } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: BATCH,
    select: { id: true },
  });

  let sent = 0;
  let failed = 0;
  for (const { id } of pending) {
    const outcome = await db.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Notification"
          WHERE id = ${id} AND "sentAt" IS NULL AND attempts < ${MAX_ATTEMPTS}
          FOR UPDATE SKIP LOCKED`;
        if (locked.length === 0) return "skipped";

        const notification = await tx.notification.findUniqueOrThrow({
          where: { id },
          select: {
            type: true,
            booking: {
              select: {
                startsAt: true,
                totalPrice: true,
                cancelledBy: true,
                client: { select: { name: true, phone: true } },
                master: { select: { name: true } },
                items: {
                  orderBy: { sortOrder: "asc" },
                  select: { serviceName: true },
                },
              },
            },
          },
        });
        const { booking } = notification;
        try {
          await send(
            formatNotification(notification.type, {
              clientName: booking.client.name,
              clientPhone: booking.client.phone,
              masterName: booking.master.name,
              startsAt: booking.startsAt,
              services: booking.items.map((item) => item.serviceName),
              totalPrice: booking.totalPrice,
              cancelledBy: booking.cancelledBy,
            }),
          );
        } catch (error) {
          await tx.notification.update({
            where: { id },
            data: {
              attempts: { increment: 1 },
              lastError: (error instanceof Error
                ? error.message
                : String(error)
              ).slice(0, 500),
            },
          });
          return "failed";
        }
        await tx.notification.update({
          where: { id },
          data: {
            sentAt: new Date(),
            attempts: { increment: 1 },
            lastError: null,
          },
        });
        return "sent";
      },
      // Внутри — запрос к Telegram (до 10 секунд), а не только к БД.
      { timeout: 20_000 },
    );
    if (outcome === "sent") sent += 1;
    if (outcome === "failed") failed += 1;
  }
  return { sent, failed };
}
