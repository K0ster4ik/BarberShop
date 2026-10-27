import type { Metadata } from "next";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/server/auth";
import { ROLE_LABELS, SECTION_ROLES } from "@/server/auth/access";
import { countTodayBookings } from "@/server/bookings/queries";

export const metadata: Metadata = { title: "Сегодня" };

// Временная версия экрана «Сегодня»: полный экран собирается на этапе 7.
export default async function TodayPage() {
  const staff = await requireRole(...SECTION_ROLES.today);
  // «Сегодня» зависит от момента запроса: без connection() Next.js попытался бы
  // зафиксировать new Date() при пререндере.
  await connection();
  const bookingsToday = await countTodayBookings(staff, new Date());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Здравствуйте, {staff.name.split(" ")[0]}
        </h1>
        <Badge variant="secondary">{ROLE_LABELS[staff.role]}</Badge>
      </div>
      <div className="w-full max-w-xs rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">
          {staff.role === "MASTER"
            ? "Ваших записей сегодня"
            : "Записей сегодня"}
        </p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">
          {bookingsToday}
        </p>
      </div>
    </div>
  );
}
