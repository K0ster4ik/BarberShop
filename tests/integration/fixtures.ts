import type { PrismaClient } from "@/generated/prisma/client";
import type { StaffUser } from "@/server/auth/access";
import { resetDemoData } from "@/server/demo/reset";

export const TEST_PASSWORDS = {
  owner: "owner-test-password",
  admin: "admin-test-password",
  master: "master-test-password",
};

// Вторник, 14:30 по Москве — то же «сейчас», что и в тестах генератора.
export const TEST_NOW = new Date("2026-11-03T11:30:00Z");

/** Демо-данные и сотрудники для проверки прав. */
export async function seedDemo(db: PrismaClient, uploadsDir?: string) {
  await resetDemoData(db, {
    now: TEST_NOW,
    passwords: TEST_PASSWORDS,
    uploadsDir,
  });
  const masters = await db.master.findMany({ orderBy: { sortOrder: "asc" } });
  const own = masters.find((m) => m.userId === "demo-user-master");
  const other = masters.find((m) => m.userId !== "demo-user-master");
  if (!own || !other) throw new Error("Demo data has no masters");

  const owner: StaffUser = {
    id: "demo-user-owner",
    name: "Игорь Ковалёв",
    email: "owner@demo.ru",
    role: "OWNER",
    masterId: null,
  };
  const master: StaffUser = {
    id: "demo-user-master",
    name: "Артём Соколов",
    email: "master@demo.ru",
    role: "MASTER",
    masterId: own.id,
  };
  return { owner, master, ownMasterId: own.id, otherMasterId: other.id };
}
