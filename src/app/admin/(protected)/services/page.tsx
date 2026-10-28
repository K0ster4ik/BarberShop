import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { ServicesView } from "@/components/admin/services/services-view";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";
import { listCatalog } from "@/server/catalog/service";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Услуги" };

export default function ServicesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Services />
    </Suspense>
  );
}

async function Services() {
  await requireRole(...SECTION_ROLES.services);
  const categories = await listCatalog(db);
  return <ServicesView categories={categories} />;
}
