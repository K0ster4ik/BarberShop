import { connection } from "next/server";
import { db } from "@/server/db";

// Проверка живости для healthcheck контейнера: приложение отвечает и видит БД.
export async function GET() {
  await connection();

  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "db_unavailable" }, { status: 503 });
  }
}
