import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/coming-soon";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";

export const metadata: Metadata = { title: "Аналитика" };

export default async function AnalyticsPage() {
  await requireRole(...SECTION_ROLES.analytics);
  return <ComingSoon title="Аналитика" stage={9} />;
}
