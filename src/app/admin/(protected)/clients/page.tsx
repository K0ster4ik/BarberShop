import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClientFilters } from "@/components/admin/clients/client-filters";
import {
  parseClientFilters,
  toClientSearch,
} from "@/components/admin/clients/search-params";
import { TagBadge } from "@/components/admin/clients/tag-badge";
import { PageHeader } from "@/components/admin/page-header";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { Pager } from "@/components/admin/pager";
import { formatDiscount, formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { plural } from "@/lib/plural";
import { formatSalonDate } from "@/lib/time";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";
import {
  type ClientListRow,
  listClients,
  listTags,
} from "@/server/clients/queries";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Клиенты" };

export default function ClientsPage({
  searchParams,
}: PageProps<"/admin/clients">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Clients searchParams={searchParams} />
    </Suspense>
  );
}

async function Clients({
  searchParams,
}: Pick<PageProps<"/admin/clients">, "searchParams">) {
  const staff = await requireRole(...SECTION_ROLES.clients);
  const filters = parseClientFilters(await searchParams);
  const manager = staff.role !== "MASTER";
  const [list, tags, masters] = await Promise.all([
    listClients(db, staff, filters, new Date()),
    listTags(db),
    manager
      ? db.master.findMany({
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true },
        })
      : null,
  ]);
  const { page, ...values } = filters;
  const filtered =
    values.query !== "" ||
    values.tagId !== null ||
    values.masterId !== null ||
    values.segment !== "all";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Клиенты"
        description={
          manager
            ? "Клиентская база салона: контакты, теги, заметки и история визитов."
            : "Клиенты ваших записей: заметки и история визитов к вам."
        }
      />
      <ClientFilters values={values} tags={tags} masters={masters} />

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {list.total === 0
          ? filtered
            ? "Никого не нашлось. Попробуйте изменить фильтры."
            : "Клиентов пока нет — они появятся после первой записи."
          : `${list.total} ${plural(list.total, ["клиент", "клиента", "клиентов"])}`}
      </p>

      {list.rows.length > 0 && (
        <>
          <ul className="flex flex-col gap-2 md:hidden">
            {list.rows.map((row) => (
              <li key={row.id}>
                <ClientCard row={row} />
              </li>
            ))}
          </ul>
          <ClientTable rows={list.rows} />
        </>
      )}

      <Pager
        page={page}
        pageCount={list.pageCount}
        href={(target) => `/admin/clients${toClientSearch(values, target)}`}
      />
    </div>
  );
}

function lastVisit(row: ClientListRow): string {
  return row.lastVisitAt ? formatSalonDate(row.lastVisitAt) : "визитов нет";
}

function ClientCard({ row }: { row: ClientListRow }) {
  return (
    <Link
      href={`/admin/clients/${row.id}`}
      className="flex flex-col gap-1 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{row.name}</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatPhone(row.phone)}
        </span>
      </span>
      <span className="text-sm text-muted-foreground">
        {row.visits} {plural(row.visits, ["визит", "визита", "визитов"])} ·
        последний: {lastVisit(row)}
      </span>
      {row.tags.length > 0 && (
        <span className="mt-1 flex flex-wrap gap-1">
          {row.tags.map((tag) => (
            <TagBadge key={tag.id} name={tag.name} color={tag.color} />
          ))}
        </span>
      )}
    </Link>
  );
}

function ClientTable({ rows }: { rows: ClientListRow[] }) {
  return (
    <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Клиент</th>
            <th className="px-3 py-2 font-medium">Теги</th>
            <th className="px-3 py-2 text-right font-medium">Визиты</th>
            <th className="px-3 py-2 font-medium">Последний визит</th>
            <th className="px-3 py-2 text-right font-medium">Сумма</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr
              key={row.id}
              className="relative transition-colors hover:bg-muted/50"
            >
              <td className="px-3 py-2.5">
                {/* Ссылка растянута на всю строку: кликается любое место. */}
                <Link
                  href={`/admin/clients/${row.id}`}
                  className="font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                >
                  {row.name}
                </Link>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {formatPhone(row.phone)}
                  {row.discountKind &&
                    row.discountValue &&
                    ` · скидка ${formatDiscount(row.discountKind, row.discountValue)}`}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <span className="flex flex-wrap gap-1">
                  {row.tags.map((tag) => (
                    <TagBadge key={tag.id} name={tag.name} color={tag.color} />
                  ))}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {row.visits}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {lastVisit(row)}
                {row.upcoming > 0 && (
                  <span className="block text-xs text-muted-foreground">
                    есть запись впереди
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatMoney(row.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
