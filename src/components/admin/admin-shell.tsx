import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { requireRole } from "@/server/auth";
import { ROLE_LABELS, SECTION_ROLES } from "@/server/auth/access";
import { AdminNav } from "./admin-nav";
import { MobileNav } from "./mobile-nav";
import { navItemsFor } from "./nav-items";
import { UserMenu } from "./user-menu";

/** Каркас админки: меню по роли и меню пользователя. Читает сессию, поэтому рендерится за Suspense. */
export async function AdminShell({ children }: { children: ReactNode }) {
  const staff = await requireRole(...SECTION_ROLES.today);
  const items = navItemsFor(staff.role);

  return (
    <ShellFrame
      nav={<AdminNav items={items} />}
      header={
        <>
          <MobileNav items={items} />
          <div className="flex-1" />
          <UserMenu
            name={staff.name}
            email={staff.email}
            roleLabel={ROLE_LABELS[staff.role]}
          />
        </>
      }
    >
      {children}
    </ShellFrame>
  );
}

export function AdminShellSkeleton() {
  return (
    <ShellFrame
      nav={
        <div className="flex flex-col gap-2 p-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-9" />
          ))}
        </div>
      }
      header={
        <>
          <div className="flex-1" />
          <Skeleton className="h-9 w-32" />
        </>
      }
    >
      <Skeleton className="h-8 w-48" />
    </ShellFrame>
  );
}

function ShellFrame({
  nav,
  header,
  children,
}: {
  nav: ReactNode;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-1">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b px-5 font-semibold">
          Барбершоп · CRM
        </div>
        {nav}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4">
          {header}
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
