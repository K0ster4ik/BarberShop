"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { type LoginInput, loginSchema } from "@/lib/validation/auth";
import { auth } from "@/server/auth";
import { safeAdminPath } from "@/server/auth/access";
import { ACCOUNT_DISABLED_MESSAGE } from "@/server/auth/config";
import { clientIp, createRateLimiter } from "@/server/rate-limit";

// Вход идёт через Server Action, а не через HTTP-эндпоинт Better Auth,
// поэтому встроенный лимит Better Auth сюда не действует — ставим свой.
const loginLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });

export type SignInResult = { error: string };

export async function signIn(
  input: LoginInput,
  next: string | null,
): Promise<SignInResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: "Проверьте email и пароль." };

  const requestHeaders = await headers();
  if (!loginLimiter.consume(clientIp(requestHeaders)).allowed) {
    return {
      error: "Слишком много попыток входа. Попробуйте через несколько минут.",
    };
  }

  try {
    await auth.api.signInEmail({ body: parsed.data, headers: requestHeaders });
  } catch (error) {
    if (isAPIError(error) && error.statusCode === 401) {
      return { error: "Неверный email или пароль." };
    }
    if (isAPIError(error) && error.statusCode === 403) {
      return { error: ACCOUNT_DISABLED_MESSAGE };
    }
    throw error;
  }

  redirect(safeAdminPath(next));
}
