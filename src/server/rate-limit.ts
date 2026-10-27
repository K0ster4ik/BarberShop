// Лимит запросов в памяти процесса: приложение работает в одном контейнере,
// поэтому общего хранилища не нужно (DESIGN.md, раздел 10).

type Bucket = { count: number; resetAt: number };

const PRUNE_THRESHOLD = 10_000;

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
}) {
  const buckets = new Map<string, Bucket>();

  function prune(now: number) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return {
    /** Засчитывает попытку. `allowed: false` — лимит исчерпан до `retryAfterMs`. */
    consume(
      key: string,
      now = Date.now(),
    ): { allowed: boolean; retryAfterMs: number } {
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        if (buckets.size >= PRUNE_THRESHOLD) prune(now);
        buckets.set(key, { count: 1, resetAt: now + options.windowMs });
        return { allowed: true, retryAfterMs: 0 };
      }
      if (bucket.count >= options.limit) {
        return { allowed: false, retryAfterMs: bucket.resetAt - now };
      }
      bucket.count += 1;
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}

/**
 * IP клиента. В продакшене перед приложением стоит Caddy: он перезаписывает
 * X-Forwarded-For реальным адресом, поэтому подделать первый элемент нельзя.
 * Локально заголовка нет — все запросы считаются с одного адреса.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
