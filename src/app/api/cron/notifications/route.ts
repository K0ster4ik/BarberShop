import { timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import { deliverPendingNotifications } from "@/server/notifications";

// Повторная отправка уведомлений, которые не ушли сразу (DESIGN.md, раздел 9).
// Cron-контейнер вызывает раз в 5 минут с секретом в заголовке, а не в URL:
// URL попадает в логи.

function authorized(request: Request): boolean {
  if (!env.CRON_SECRET) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(await deliverPendingNotifications());
}
