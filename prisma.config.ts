import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Не через env(): `prisma generate` при сборке образа должен работать без БД.
    url: process.env.DATABASE_URL,
  },
});
