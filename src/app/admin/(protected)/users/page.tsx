import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/coming-soon";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";

export const metadata: Metadata = { title: "Пользователи" };

export default async function UsersPage() {
  await requireRole(...SECTION_ROLES.users);
  return <ComingSoon title="Пользователи" stage={4} />;
}
