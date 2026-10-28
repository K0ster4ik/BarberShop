import type { Metadata } from "next";
import { Suspense } from "react";
import { ComingSoon } from "@/components/admin/coming-soon";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { RoleGate } from "@/components/admin/role-gate";
import { SECTION_ROLES } from "@/server/auth/access";

export const metadata: Metadata = { title: "Записи" };

export default function BookingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RoleGate roles={SECTION_ROLES.bookings}>
        <ComingSoon title="Записи" stage={7} />
      </RoleGate>
    </Suspense>
  );
}
