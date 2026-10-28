import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { ForbiddenError } from "@/server/auth/access";
import { isUniqueViolation } from "@/server/db-errors";
import { DomainError } from "@/server/errors";

// Единый формат ответа Server Actions справочников: форма показывает общее
// сообщение и/или ошибки конкретных полей.

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return fields;
}

/**
 * Выполняет действие и превращает ожидаемые ошибки в ответ для формы.
 * redirect()/forbidden() из requireRole пробрасываются дальше — их обрабатывает Next.js.
 */
export async function runAction<T>(
  fn: () => Promise<T>,
  successMessage?: string,
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: successMessage };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof DomainError) {
      return {
        ok: false,
        error: error.message,
        fieldErrors: error.field ? { [error.field]: error.message } : undefined,
      };
    }
    if (error instanceof ForbiddenError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: "Проверьте поля формы.",
        fieldErrors: zodFieldErrors(error),
      };
    }
    if (isUniqueViolation(error)) {
      return { ok: false, error: "Такая запись уже существует." };
    }
    console.error(error);
    return { ok: false, error: "Не удалось сохранить. Попробуйте ещё раз." };
  }
}
