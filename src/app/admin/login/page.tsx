import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentStaff } from "@/server/auth";
import { safeAdminPath } from "@/server/auth/access";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Вход в CRM",
  robots: { index: false },
};

export default function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
      <p className="font-display text-lg font-semibold tracking-[0.14em] text-primary uppercase">
        Барбершоп · CRM
      </p>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Вход в CRM</CardTitle>
          <CardDescription>
            Для сотрудников барбершопа. Доступ к демо выдаётся по запросу.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<LoginFormSkeleton />}>
            <LoginFormGate searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}

// Сессия и параметры запроса читаются во время запроса, поэтому — за Suspense.
async function LoginFormGate({
  searchParams,
}: Pick<PageProps<"/admin/login">, "searchParams">) {
  const [staff, params] = await Promise.all([getCurrentStaff(), searchParams]);
  const next = typeof params.next === "string" ? params.next : null;
  if (staff) redirect(safeAdminPath(next));
  return <LoginForm next={next} />;
}

function LoginFormSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
      <Skeleton className="h-9" />
    </div>
  );
}
