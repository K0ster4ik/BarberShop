import "server-only";
import { z } from "zod";

// Переменные добавляются сюда по мере появления функций, которые их используют
// (полный список — DESIGN.md, раздел 12.3).
/** Пустая строка в .env («TELEGRAM_BOT_TOKEN=») — то же, что переменная не задана. */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional(),
  );
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.url(),
  APP_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  // Ограничения для общих демо-учёток (DESIGN.md, раздел 10).
  DEMO_MODE: z.stringbool().default(false),
  // Загруженные файлы (фото мастеров). В продакшене — Docker volume.
  UPLOADS_DIR: z.string().min(1).default("uploads"),
  // Публичный канал с заявками (DESIGN.md, раздел 9). Без бота уведомления
  // копятся в очереди и уйдут, когда его настроят.
  TELEGRAM_BOT_TOKEN: optional(z.string().min(20)),
  TELEGRAM_CHAT_ID: optional(z.string().min(1)),
  TELEGRAM_CHANNEL_URL: optional(z.url()),
  // Секрет для /api/cron/*: передаётся в заголовке Authorization.
  CRON_SECRET: optional(z.string().min(32)),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment variables:\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = parsed.data;
