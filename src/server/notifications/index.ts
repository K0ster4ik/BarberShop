import "server-only";
import { env } from "@/env";
import { db } from "@/server/db";
import { deliverNotifications } from "./outbox";
import { sendTelegramMessage } from "./telegram";

/**
 * Отправляет уведомления из очереди в канал. Без настроенного бота ничего не делает:
 * уведомления дождутся настройки, а запись от этого не ломается.
 */
export async function deliverPendingNotifications(ids?: readonly string[]) {
  const { TELEGRAM_BOT_TOKEN: botToken, TELEGRAM_CHAT_ID: chatId } = env;
  if (!botToken || !chatId) return { sent: 0, failed: 0, skipped: true };
  const result = await deliverNotifications(
    db,
    (text) => sendTelegramMessage({ botToken, chatId }, text),
    { ids },
  );
  if (result.failed > 0) {
    console.warn(`Telegram: не отправлено уведомлений — ${result.failed}`);
  }
  return { ...result, skipped: false };
}
