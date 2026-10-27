import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/coming-soon";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";

export const metadata: Metadata = { title: "Клиенты" };

export default async function ClientsPage() {
  await requireRole(...SECTION_ROLES.clients);
  return <ComingSoon title="Клиенты" stage={8} />;
}
