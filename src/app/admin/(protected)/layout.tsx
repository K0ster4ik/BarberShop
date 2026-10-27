import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminShell, AdminShellSkeleton } from "@/components/admin/admin-shell";

export const metadata: Metadata = {
  title: { default: "CRM", template: "%s — CRM" },
  robots: { index: false },
};

// Проверка сессии в layout защищает каркас, но не данные: каждая страница
// и каждый Server Action вызывают requireRole сами.
export default function ProtectedAdminLayout({
  children,
}: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
