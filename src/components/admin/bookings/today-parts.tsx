import { Phone } from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import type { Role } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { formatSalonVisit, toSalonDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { nextStatuses } from "@/server/bookings/lifecycle";
import type { DayBoard, PendingRequest } from "@/server/bookings/staff-queries";
import { STATUS_BLOCK } from "./labels";
import { StatusActions } from "./status-actions";
import { StatusBadge } from "./status-badge";

// Части экрана «Сегодня» (DESIGN.md, 8.4; docs/design/crm-concept-light.webp).

export function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <Icon
        className="hidden size-8 shrink-0 text-primary sm:block"
        aria-hidden
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold break-words tabular-nums sm:truncate sm:text-2xl">
          {value}
        </span>
      </span>
    </>
  );
  const className =
    "flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors";
  return href ? (
    <Link
      href={href}
      className={cn(
        className,
        "hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Заявка с сайта: подтвердить или отклонить, не открывая карточку. */
export function RequestCard({
  request,
  role,
  now,
  today,
}: {
  request: PendingRequest;
  role: Role;
  now: Date;
  today: string;
}) {
  const soon = toSalonDate(request.startsAt) === today;
  const allowed = nextStatuses(
    { status: "PENDING", startsAt: request.startsAt },
    role,
    now,
  ).filter((status) => status === "CONFIRMED" || status === "CANCELLED");
  return (
    <article className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/admin/bookings/${request.id}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {request.client.name}
        </Link>
        <span className="shrink-0 font-medium tabular-nums">
          {formatMoney(request.totalPrice)}
        </span>
      </div>
      <a
        href={`tel:${request.client.phone}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <Phone className="size-3.5" aria-hidden />
        {formatPhone(request.client.phone)}
      </a>
      <p className="text-sm">
        {request.services}
        {role !== "MASTER" && (
          <span className="text-muted-foreground">
            {" "}
            · {request.master.name}
          </span>
        )}
      </p>
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {formatSalonVisit(request.startsAt)}
        {soon && (
          <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-950 dark:bg-amber-400/20 dark:text-amber-100">
            сегодня
          </span>
        )}
      </p>
      {request.clientComment && (
        <p className="line-clamp-3 rounded-md bg-muted/60 px-2 py-1 text-sm text-muted-foreground">
          {request.clientComment}
        </p>
      )}
      <StatusActions
        bookingId={request.id}
        allowed={allowed}
        totalPrice={request.totalPrice}
        fromWebsite
        cancelLabel="Отклонить"
        className="mt-1 [&>*]:flex-1"
      />
    </article>
  );
}

/** Расписание дня списком — на телефоне вместо сетки по мастерам. */
export function ScheduleList({
  board,
  showMaster,
}: {
  board: DayBoard;
  showMaster: boolean;
}) {
  const rows = board.columns
    .flatMap((column) =>
      column.bookings.map((booking) => ({ ...booking, master: column.master })),
    )
    .sort((a, b) => a.startMin - b.startMin);
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-muted-foreground">
        На сегодня записей нет.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/admin/bookings/${row.id}`}
            className={cn(
              "flex gap-3 rounded-md border-l-4 p-3 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              STATUS_BLOCK[row.status],
            )}
          >
            <span className="w-12 shrink-0 font-semibold tabular-nums">
              {row.start}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-medium">{row.clientName}</span>
              <span className="truncate text-sm text-muted-foreground">
                {row.services}
                {showMaster && ` · ${row.master.name}`}
              </span>
              <StatusBadge
                status={row.status}
                totalPrice={row.totalPrice}
                paid={row.paid}
                className="mt-1"
              />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
