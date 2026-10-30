import { CalendarDays, Clock, Hourglass, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DayBoardView } from "@/components/admin/bookings/day-board";
import {
  RequestCard,
  ScheduleList,
  StatCard,
} from "@/components/admin/bookings/today-parts";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { salon } from "@/config/salon";
import { formatMoney } from "@/lib/money";
import { formatSalonTime, toSalonDate, toSalonMinutes } from "@/lib/time";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";
import {
  loadDayBoard,
  loadPendingRequests,
  loadTodayStats,
} from "@/server/bookings/staff-queries";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Сегодня" };

// Ближайшие заявки; остальные — в списке записей по ссылке.
const REQUESTS_SHOWN = 5;

const todayFormat = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: salon.timezone,
});

// Экран «Сегодня» (DESIGN.md, 8.4): записи дня по мастерам, ближайшая запись,
// заявки с сайта с быстрым подтверждением, выручка дня (MASTER — только своя).
export default function TodayPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Today />
    </Suspense>
  );
}

async function Today() {
  // requireRole переводит рендер на момент запроса, поэтому new Date() здесь безопасен.
  const staff = await requireRole(...SECTION_ROLES.today);
  const now = new Date();
  const today = toSalonDate(now);
  const [stats, board, requests] = await Promise.all([
    loadTodayStats(db, staff, now),
    loadDayBoard(db, staff, today),
    loadPendingRequests(db, staff, now, REQUESTS_SHOWN),
  ]);
  const own = staff.role === "MASTER";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Здравствуйте, {staff.name.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground first-letter:uppercase">
          {todayFormat.format(now)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={CalendarDays}
          label={own ? "Ваших записей сегодня" : "Записей сегодня"}
          value={stats.bookings}
          href="/admin/calendar"
        />
        <StatCard
          icon={Hourglass}
          label="Ждут подтверждения"
          value={stats.pending}
          href="/admin/bookings?status=PENDING"
        />
        <StatCard
          icon={Clock}
          label="Ближайшая"
          value={
            stats.next
              ? `${formatSalonTime(stats.next.startsAt)} ${stats.next.clientName.split(" ")[0]}`
              : "—"
          }
          href={stats.next ? `/admin/bookings/${stats.next.id}` : undefined}
        />
        {stats.revenue !== null && (
          <StatCard
            icon={Wallet}
            label={own ? "Ваша выручка сегодня" : "Выручка сегодня"}
            value={formatMoney(stats.revenue)}
          />
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <section
          aria-labelledby="requests-title"
          className="flex flex-col gap-3 xl:order-2"
        >
          <h2
            id="requests-title"
            className="flex items-center gap-2 font-display text-xl font-semibold"
          >
            Заявки с сайта
            <span className="rounded-full bg-primary/15 px-2 text-sm font-medium text-foreground tabular-nums">
              {stats.pending}
            </span>
          </h2>
          {requests.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Новых заявок нет. Записи с сайта появятся здесь — их нужно
              подтвердить.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {requests.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  role={staff.role}
                  now={now}
                />
              ))}
              {stats.pending > requests.length && (
                <Link
                  href="/admin/bookings?status=PENDING"
                  className="flex min-h-11 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground hover:text-foreground"
                >
                  Все заявки: {stats.pending}
                </Link>
              )}
            </div>
          )}
        </section>

        <section
          aria-labelledby="schedule-title"
          className="flex min-w-0 flex-col gap-3 xl:order-1"
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              id="schedule-title"
              className="font-display text-xl font-semibold"
            >
              Расписание
            </h2>
            <Link
              href="/admin/calendar"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Календарь
            </Link>
          </div>
          <div className="md:hidden">
            <ScheduleList board={board} showMaster={!own} />
          </div>
          <div className="hidden md:block">
            <DayBoardView board={board} nowMin={toSalonMinutes(now)} />
          </div>
        </section>
      </div>
    </div>
  );
}
