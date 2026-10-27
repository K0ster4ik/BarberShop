import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/coming-soon";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";

export const metadata: Metadata = { title: "Мастера" };

export default async function MastersPage() {
  await requireRole(...SECTION_ROLES.masters);
  return <ComingSoon title="Мастера" stage={4} />;
}
