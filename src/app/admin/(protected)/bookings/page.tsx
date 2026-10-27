import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/coming-soon";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";

export const metadata: Metadata = { title: "Записи" };

export default async function BookingsPage() {
  await requireRole(...SECTION_ROLES.bookings);
  return <ComingSoon title="Записи" stage={7} />;
}
