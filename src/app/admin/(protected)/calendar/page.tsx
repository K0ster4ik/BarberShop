import type { Metadata } from "next";
import { Suspense } from "react";
import { ComingSoon } from "@/components/admin/coming-soon";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { RoleGate } from "@/components/admin/role-gate";
import { SECTION_ROLES } from "@/server/auth/access";

export const metadata: Metadata = { title: "Календарь" };

export default function CalendarPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RoleGate roles={SECTION_ROLES.calendar}>
        <ComingSoon title="Календарь" stage={7} />
      </RoleGate>
    </Suspense>
  );
}
