import type { ReactNode } from "react";
import type { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/server/auth";

/**
 * Проверка роли для страниц без собственных данных. Вызывать внутри <Suspense>:
 * проверка читает сессию в момент запроса (шаблон страниц — DESIGN.md, раздел 4).
 */
export async function RoleGate({
  roles,
  children,
}: {
  roles: readonly Role[];
  children: ReactNode;
}) {
  await requireRole(...roles);
  return children;
}
