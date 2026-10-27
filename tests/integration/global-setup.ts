import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { Client } from "pg";
import { testDatabaseUrl } from "./test-db";

// Создаёт тестовую БД, если её нет, и применяет к ней все миграции.
export default async function setup() {
  const url = testDatabaseUrl();
  const name = new URL(url).pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error(`Unexpected test database name: ${name}`);
  }

  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = "/postgres";
  const client = new Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();
  try {
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name],
    );
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await client.end();
  }

  const require = createRequire(import.meta.url);
  const prismaCli = path.join(
    path.dirname(require.resolve("prisma/package.json")),
    "build/index.js",
  );
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
