import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/coming-soon";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";

export const metadata: Metadata = { title: "Промокоды" };

export default async function PromoCodesPage() {
  await requireRole(...SECTION_ROLES.promoCodes);
  return <ComingSoon title="Промокоды" stage={4} />;
}
