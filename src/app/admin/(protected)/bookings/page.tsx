import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookingFilters } from "@/components/admin/bookings/booking-filters";
import { SOURCE_LABELS } from "@/components/admin/bookings/labels";
import {
  parseFilters,
  toSearch,
} from "@/components/admin/bookings/search-params";
import { StatusBadge } from "@/components/admin/bookings/status-badge";
import { PageHeader } from "@/components/admin/page-header";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { plural } from "@/lib/plural";
import { formatSalonVisit } from "@/lib/time";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";
import {
  type BookingListRow,
  listBookings,
} from "@/server/bookings/staff-queries";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Записи" };

export default function BookingsPage({
  searchParams,
}: PageProps<"/admin/bookings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Bookings searchParams={searchParams} />
    </Suspense>
  );
}

async function Bookings({
  searchParams,
}: Pick<PageProps<"/admin/bookings">, "searchParams">) {
  const staff = await requireRole(...SECTION_ROLES.bookings);
  const filters = parseFilters(await searchParams);
  const manager = staff.role !== "MASTER";
  const [list, masters] = await Promise.all([
    listBookings(db, staff, filters, new Date()),
    manager
      ? db.master.findMany({
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true },
        })
      : null,
  ]);
  const { page, ...values } = filters;
  const filtered =
    values.query !== "" || values.status !== null || values.masterId !== null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Записи"
        description={
          manager
            ? "Все записи салона: поиск по клиенту, статусу и мастеру."
            : "Ваши записи: поиск по клиенту и статусу."
        }
        actions={
          manager && (
            <Button asChild>
              <Link href="/admin/bookings/new">
                <Plus aria-hidden /> Запись
              </Link>
            </Button>
          )
        }
      />
      <BookingFilters values={values} masters={masters} />

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {list.total === 0
          ? filtered
            ? "Ничего не нашлось. Попробуйте изменить фильтры."
            : "Записей за этот период нет."
          : `${list.total} ${plural(list.total, ["запись", "записи", "записей"])}`}
      </p>

      {list.rows.length > 0 && (
        <>
          <ul className="flex flex-col gap-2 md:hidden">
            {list.rows.map((row) => (
              <li key={row.id}>
                <BookingCard row={row} showMaster={manager} />
              </li>
            ))}
          </ul>
          <BookingTable rows={list.rows} showMaster={manager} />
        </>
      )}

      {list.pageCount > 1 && (
        <nav
          aria-label="Страницы"
          className="flex items-center justify-between gap-3"
        >
          <PageLink
            href={toSearch(values, page - 1)}
            disabled={page <= 1}
            label="Назад"
            icon="prev"
          />
          <span className="text-sm text-muted-foreground">
            Страница {page} из {list.pageCount}
          </span>
          <PageLink
            href={toSearch(values, page + 1)}
            disabled={page >= list.pageCount}
            label="Дальше"
            icon="next"
          />
        </nav>
      )}
    </div>
  );
}

function BookingCard({
  row,
  showMaster,
}: {
  row: BookingListRow;
  showMaster: boolean;
}) {
  return (
    <Link
      href={`/admin/bookings/${row.id}`}
      className="flex flex-col gap-1 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{formatSalonVisit(row.startsAt)}</span>
        <span className="tabular-nums">{formatMoney(row.totalPrice)}</span>
      </span>
      <span>
        {row.client.name}
        <span className="text-muted-foreground">
          {" "}
          · {formatPhone(row.client.phone)}
        </span>
      </span>
      <span className="text-sm text-muted-foreground">
        {row.services}
        {showMaster && ` · ${row.master.name}`}
      </span>
      <StatusBadge
        status={row.status}
        totalPrice={row.totalPrice}
        paid={row.paid}
        className="mt-1"
      />
    </Link>
  );
}

function BookingTable({
  rows,
  showMaster,
}: {
  rows: BookingListRow[];
  showMaster: boolean;
}) {
  return (
    <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Когда</th>
            <th className="px-3 py-2 font-medium">Клиент</th>
            {showMaster && <th className="px-3 py-2 font-medium">Мастер</th>}
            <th className="px-3 py-2 font-medium">Услуги</th>
            <th className="px-3 py-2 text-right font-medium">Сумма</th>
            <th className="px-3 py-2 font-medium">Статус</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr
              key={row.id}
              className="relative transition-colors hover:bg-muted/50"
            >
              <td className="px-3 py-2.5 whitespace-nowrap">
                {/* Ссылка растянута на всю строку: кликается любое место. */}
                <Link
                  href={`/admin/bookings/${row.id}`}
                  className="font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                >
                  {formatSalonVisit(row.startsAt)}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {SOURCE_LABELS[row.source]}
                </span>
              </td>
              <td className="px-3 py-2.5">
                {row.client.name}
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {formatPhone(row.client.phone)}
                </span>
              </td>
              {showMaster && <td className="px-3 py-2.5">{row.master.name}</td>}
              <td className="max-w-64 px-3 py-2.5 text-muted-foreground">
                {row.services}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatMoney(row.totalPrice)}
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge
                  status={row.status}
                  totalPrice={row.totalPrice}
                  paid={row.paid}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  icon,
}: {
  href: string;
  disabled: boolean;
  label: string;
  icon: "prev" | "next";
}) {
  const content = (
    <>
      {icon === "prev" && <ChevronLeft aria-hidden />}
      {label}
      {icon === "next" && <ChevronRight aria-hidden />}
    </>
  );
  if (disabled) {
    return (
      <Button variant="outline" className="h-11 sm:h-8" disabled>
        {content}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" className="h-11 sm:h-8">
      <Link href={`/admin/bookings${href}`}>{content}</Link>
    </Button>
  );
}
