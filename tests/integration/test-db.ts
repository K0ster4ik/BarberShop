import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * URL тестовой БД. Тесты очищают таблицы, поэтому отказываемся работать
 * с базой, имя которой не заканчивается на `_test`, и с рабочей DATABASE_URL.
 */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  }
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith("_test") || url === process.env.DATABASE_URL) {
    throw new Error(
      `Refusing to run integration tests against "${name}": use a separate *_test database`,
    );
  }
  return url;
}

export function createTestDb(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
  });
}
