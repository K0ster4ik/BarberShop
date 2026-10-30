import Link from "next/link";
import type { CSSProperties } from "react";
import { MasterAvatar } from "@/components/master-avatar";
import { minutesToTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { BoardBooking, DayBoard } from "@/server/bookings/staff-queries";
import { STATUS_BLOCK } from "./labels";
import { StatusBadge } from "./status-badge";

// Расписание дня по мастерам (docs/design/crm-concept-*.webp): колонка на мастера,
// время сверху вниз. Нерабочее время заштриховано, отсутствия подписаны.

const PX_PER_MIN = 1.2; // 72px на час: у часовой записи помещаются три строки

const offHours: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--muted) 0 6px, transparent 6px 12px)",
};

export function DayBoardView({
  board,
  nowMin,
}: {
  board: DayBoard;
  nowMin: number | null; // красная линия «сейчас» — только для сегодняшнего дня
}) {
  const { fromMin, toMin, columns } = board;
  if (columns.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-muted-foreground">
        Нет мастеров, к которым можно записать.
      </p>
    );
  }
  const height = (toMin - fromMin) * PX_PER_MIN;
  const y = (minutes: number) => (minutes - fromMin) * PX_PER_MIN;
  const hours = Array.from(
    { length: (toMin - fromMin) / 60 },
    (_, index) => fromMin + index * 60,
  );
  const showNow = nowMin !== null && nowMin >= fromMin && nowMin <= toMin;

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `3.25rem repeat(${columns.length}, minmax(8rem, 1fr))`,
          // Ширина — по минимуму колонок, а не по длине текста в плашках: иначе
          // сетка не помещается даже там, где места хватает.
          minWidth: `calc(3.25rem + ${columns.length} * 8rem)`,
        }}
      >
        <div className="sticky left-0 z-20 border-b bg-card" />
        {columns.map(({ master }) => (
          <div
            key={master.id}
            className="flex min-w-0 items-center gap-2 border-b border-l px-2 py-2"
          >
            <MasterAvatar
              name={master.name}
              photoPath={master.photoPath}
              sizes="32px"
              className="w-8 shrink-0 rounded-md text-xs"
            />
            <span className="truncate text-sm font-medium">{master.name}</span>
          </div>
        ))}

        <div
          className="sticky left-0 z-20 bg-card"
          style={{ height }}
          aria-hidden
        >
          {hours.map((minutes) => (
            <span
              key={minutes}
              className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums first:translate-y-0.5"
              style={{ top: y(minutes) }}
            >
              {minutesToTime(minutes)}
            </span>
          ))}
          {showNow && (
            <span
              className="absolute right-1 z-10 -translate-y-1/2 rounded bg-destructive px-1 text-[0.7rem] font-medium text-white tabular-nums"
              style={{ top: y(nowMin) }}
            >
              {minutesToTime(nowMin)}
            </span>
          )}
        </div>

        {columns.map((column) => (
          <div
            key={column.master.id}
            className="relative border-l"
            style={{ height, ...offHours }}
          >
            {column.workingHours.map((hours) => (
              <div
                key={hours.startMin}
                className="absolute inset-x-0 bg-card"
                style={{
                  top: y(Math.max(hours.startMin, fromMin)),
                  height:
                    (Math.min(hours.endMin, toMin) -
                      Math.max(hours.startMin, fromMin)) *
                    PX_PER_MIN,
                }}
              />
            ))}
            {hours.map((minutes) => (
              <div
                key={minutes}
                className="absolute inset-x-0 border-t border-border/60"
                style={{ top: y(minutes) }}
                aria-hidden
              />
            ))}
            {column.timeOffs.map((off) => (
              <div
                key={off.startMin}
                className="absolute inset-x-1 flex items-start justify-center rounded-md border border-dashed bg-muted/80 pt-1 text-xs text-muted-foreground"
                style={{
                  top: y(Math.max(off.startMin, fromMin)),
                  height:
                    (Math.min(off.endMin, toMin) -
                      Math.max(off.startMin, fromMin)) *
                    PX_PER_MIN,
                }}
              >
                Отсутствие
              </div>
            ))}
            {column.bookings.map((booking) => (
              <BookingBlock
                key={booking.id}
                booking={booking}
                top={y(booking.startMin)}
                height={
                  (Math.min(booking.endMin, toMin) - booking.startMin) *
                  PX_PER_MIN
                }
              />
            ))}
            {showNow && (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-destructive"
                style={{ top: y(nowMin) }}
                aria-hidden
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BookingBlock({
  booking,
  top,
  height,
}: {
  booking: BoardBooking;
  top: number;
  height: number;
}) {
  const time = `${minutesToTime(booking.startMin)}–${minutesToTime(booking.endMin)}`;
  return (
    <Link
      href={`/admin/bookings/${booking.id}`}
      className={cn(
        "absolute inset-x-1 flex flex-col gap-0.5 overflow-hidden rounded-md border-l-4 px-2 py-1 text-xs shadow-xs transition-colors outline-none focus-visible:z-20 focus-visible:ring-3 focus-visible:ring-ring/50",
        STATUS_BLOCK[booking.status],
      )}
      style={{ top: top + 1, height: Math.max(height - 2, 22) }}
      aria-label={`${time}, ${booking.clientName}, ${booking.services}`}
    >
      <span className="flex items-baseline gap-1.5 leading-tight">
        <span className="font-semibold tabular-nums">
          {minutesToTime(booking.startMin)}
        </span>
        <span className="truncate font-medium">{booking.clientName}</span>
      </span>
      {height >= 40 && (
        <span className="truncate text-muted-foreground">
          {booking.services}
        </span>
      )}
      {height >= 64 && (
        <StatusBadge
          status={booking.status}
          totalPrice={booking.totalPrice}
          paid={booking.paid}
        />
      )}
    </Link>
  );
}
