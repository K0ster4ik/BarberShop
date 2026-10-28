"use client";

import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { ActionResult } from "@/server/action-result";

export const NETWORK_ERROR =
  "Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.";

/**
 * Вызывает Server Action и показывает результат: общее сообщение — тостом,
 * ошибки полей — прямо в форме. Обрыв сети не должен выглядеть как «ничего не произошло».
 */
export async function runWithToast<R>(
  call: () => Promise<ActionResult<R>>,
): Promise<ActionResult<R> | null> {
  let result: ActionResult<R>;
  try {
    result = await call();
  } catch {
    toast.error(NETWORK_ERROR);
    return null;
  }
  if (!result.ok) toast.error(result.error);
  else if (result.message) toast.success(result.message);
  return result;
}

export async function submitAction<T extends FieldValues, R>(
  form: UseFormReturn<T>,
  call: () => Promise<ActionResult<R>>,
): Promise<ActionResult<R> | null> {
  const result = await runWithToast(call);
  if (result && !result.ok) {
    for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
      form.setError(field as Path<T>, { message });
    }
  }
  return result;
}
