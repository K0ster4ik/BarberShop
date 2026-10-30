import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DayBoardView } from "@/components/admin/bookings/day-board";
import { DayPicker } from "@/components/admin/bookings/day-picker";
import {
  STATUS_BLOCK,
  STATUS_LABELS,
} from "@/components/admin/bookings/labels";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { formatDay } from "@/components/admin/format";
import { Button } from "@/components/ui/button";
import type { BookingStatus } from "@/generated/prisma/enums";
import { addDays, toSalonDate, toSalonMinutes } from "@/lib/time";
import { cn } from "@/lib/utils";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";
import { boardDate, loadDayBoard } from "@/server/bookings/staff-queries";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Календарь" };

const weekday = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long",
  timeZone: "UTC",
});

const LEGEND: BookingStatus[] = [
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
  "NO_SHOW",
];

export default function CalendarPage({
  searchParams,
}: PageProps<"/admin/calendar">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Calendar searchParams={searchParams} />
    </Suspense>
  );
}

async function Calendar({
  searchParams,
}: Pick<PageProps<"/admin/calendar">, "searchParams">) {
  const staff = await requireRole(...SECTION_ROLES.calendar);
  const params = await searchParams;
  const now = new Date();
  const today = toSalonDate(now);
  const date = boardDate(
    typeof params.date === "string" ? params.date : undefined,
    now,
  );
  const board = await loadDayBoard(db, staff, date);
  const manager = staff.role !== "MASTER";
  const day = (offset: number) =>
    `/admin/calendar?date=${addDays(date, offset)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Календарь
          </h1>
          <p className="text-muted-foreground first-letter:uppercase">
            {weekday.format(new Date(`${date}T12:00:00Z`))}, {formatDay(date)}
            {date === today && " · сегодня"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="icon"
            className="size-11 sm:size-8"
          >
            <Link href={day(-1)} aria-label="Предыдущий день">
              <ChevronLeft aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 sm:h-8">
            <Link
              href="/admin/calendar"
              aria-current={date === today ? "date" : undefined}
            >
              Сегодня
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="icon"
            className="size-11 sm:size-8"
          >
            <Link href={day(1)} aria-label="Следующий день">
              <ChevronRight aria-hidden />
            </Link>
          </Button>
          <DayPicker date={date} />
          {manager && (
            <Button asChild className="h-11 sm:h-8">
              <Link href={`/admin/bookings/new?date=${date}`}>
                <Plus aria-hidden /> Запись
              </Link>
            </Button>
          )}
        </div>
      </div>

      <DayBoardView
        board={board}
        nowMin={date === today ? toSalonMinutes(now) : null}
      />

      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
        {LEGEND.map((status) => (
          <li key={status} className="flex items-center gap-2">
            <span
              className={cn(
                "h-3.5 w-5 rounded-sm border-l-4",
                STATUS_BLOCK[status],
              )}
              aria-hidden
            />
            {STATUS_LABELS[status]}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span
            className="h-3.5 w-5 rounded-sm border"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, var(--muted) 0 3px, transparent 3px 6px)",
            }}
            aria-hidden
          />
          Нерабочее время
        </li>
      </ul>
    </div>
  );
}
