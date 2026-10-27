import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { PrismaClient } from "../src/generated/prisma/client";
import { resetDemoData } from "../src/server/demo/reset";

// `npm run db:seed` (= `prisma db seed`): наполняет БД демо-данными.
// Повторный запуск сбрасывает данные к исходному состоянию.

const env = z
  .object({
    DATABASE_URL: z.url(),
    DEMO_OWNER_PASSWORD: z.string().min(8),
    DEMO_ADMIN_PASSWORD: z.string().min(8),
    DEMO_MASTER_PASSWORD: z.string().min(8),
  })
  .parse(process.env);

async function main() {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  try {
    const startedAt = Date.now();
    const summary = await resetDemoData(db, {
      passwords: {
        owner: env.DEMO_OWNER_PASSWORD,
        admin: env.DEMO_ADMIN_PASSWORD,
        master: env.DEMO_MASTER_PASSWORD,
      },
    });
    console.log(
      `Demo data ready in ${Date.now() - startedAt} ms: ` +
        `${summary.clients} clients, ${summary.bookings} bookings, ${summary.payments} payments.`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
