import { createHash, randomBytes } from "node:crypto";

// Токен ссылки на запись (DESIGN.md, 7.5): 32 случайных байта в base64url. В БД лежит
// только SHA-256 — утечка базы не даёт отменять чужие записи.

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createCancelToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashCancelToken(token) };
}

export function hashCancelToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Отсекает заведомо чужие строки до похода в БД. */
export function isCancelToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}
