import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { type UserItem, UsersView } from "@/components/admin/users/users-view";
import { env } from "@/env";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";
import { db } from "@/server/db";
import { isDemoUser } from "@/server/demo/catalog";
import { listUsers } from "@/server/users/service";

export const metadata: Metadata = { title: "Пользователи" };

export default function UsersPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Users />
    </Suspense>
  );
}

async function Users() {
  const staff = await requireRole(...SECTION_ROLES.users);
  const { users, masters } = await listUsers(db);

  const items: UserItem[] = users.map((user) => ({
    ...user,
    isSelf: user.id === staff.id,
    // Кнопки только подсказывают: запрет проверяет сервис пользователей.
    demoLocked: env.DEMO_MODE && isDemoUser(user.id),
  }));

  return <UsersView users={items} masters={masters} demoMode={env.DEMO_MODE} />;
}
