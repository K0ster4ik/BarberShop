import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/coming-soon";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";

export const metadata: Metadata = { title: "Календарь" };

export default async function CalendarPage() {
  await requireRole(...SECTION_ROLES.calendar);
  return <ComingSoon title="Календарь" stage={7} />;
}
