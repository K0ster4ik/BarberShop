import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/coming-soon";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";

export const metadata: Metadata = { title: "Услуги" };

export default async function ServicesPage() {
  await requireRole(...SECTION_ROLES.services);
  return <ComingSoon title="Услуги" stage={4} />;
}
