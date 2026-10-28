import "server-only";
import { z } from "zod";

// Переменные добавляются сюда по мере появления функций, которые их используют
// (полный список — DESIGN.md, раздел 12.3).
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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment variables:\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = parsed.data;
