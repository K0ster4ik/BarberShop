"use client";

import { unstable_rethrow } from "next/navigation";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { ActionResult } from "@/server/action-result";

export const NETWORK_ERROR =
  "Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.";

/**
 * Вызывает Server Action и показывает результат: общее сообщение — тостом,
 * ошибки полей — прямо в форме. Обрыв сети не должен выглядеть как «ничего не произошло».
 */
/**
 * redirect() или forbidden() из Server Action: роутер Next.js уже ведёт на вход или
 * показывает «Нет доступа», а обещание action отклоняется служебной ошибкой.
 */
function isRouterInterrupt(error: unknown): boolean {
  try {
    unstable_rethrow(error);
    return false;
  } catch {
    return true;
  }
}

export async function runWithToast<R>(
  call: () => Promise<ActionResult<R>>,
): Promise<ActionResult<R> | null> {
  let result: ActionResult<R>;
  try {
    result = await call();
  } catch (error) {
    if (!isRouterInterrupt(error)) toast.error(NETWORK_ERROR);
    return null;
  }
  if (!result.ok) toast.error(result.error);
  else if (result.message) toast.success(result.message);
  return result;
}

// Формы, чей запрос ещё в пути. Кнопка блокируется только после перерисовки React,
// а два клика в одной задаче успевают раньше — без этой проверки получались дубли.
const inFlight = new WeakSet<object>();

export async function submitAction<T extends FieldValues, R>(
  form: UseFormReturn<T>,
  call: () => Promise<ActionResult<R>>,
): Promise<ActionResult<R> | null> {
  if (inFlight.has(form.control)) return null;
  inFlight.add(form.control);
  try {
    const result = await runWithToast(call);
    if (result && !result.ok) {
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        form.setError(field as Path<T>, { message });
      }
    }
    return result;
  } finally {
    inFlight.delete(form.control);
  }
}
