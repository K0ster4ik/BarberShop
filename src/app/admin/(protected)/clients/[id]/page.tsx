import { ArrowLeft, Mail, Phone, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { StatusBadge } from "@/components/admin/bookings/status-badge";
import {
  ClientNotes,
  DiscountButton,
  EditClientButton,
  TagsButton,
} from "@/components/admin/clients/client-card-actions";
import { TagBadge } from "@/components/admin/clients/tag-badge";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { Button } from "@/components/ui/button";
import { formatDiscount, formatMoney, kopecksToRubles } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { plural } from "@/lib/plural";
import {
  formatBirthday,
  formatSalonDate,
  formatSalonDayTime,
  formatSalonVisit,
} from "@/lib/time";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";
import { getClientDetail, listTags } from "@/server/clients/queries";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Клиент" };

// Сколько визитов показывать в карточке; все — в списке записей по телефону.
const VISITS_SHOWN = 15;

export default function ClientPage({
  params,
}: PageProps<"/admin/clients/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClientCard params={params} />
    </Suspense>
  );
}

async function ClientCard({
  params,
}: Pick<PageProps<"/admin/clients/[id]">, "params">) {
  const staff = await requireRole(...SECTION_ROLES.clients);
  const { id } = await params;
  const now = new Date();
  // MASTER чужого клиента не получит: getClientDetail ограничен клиентами его записей.
  const [client, tags] = await Promise.all([
    getClientDetail(db, staff, id, now),
    staff.role === "MASTER" ? [] : listTags(db),
  ]);
  if (!client) notFound();

  const manager = staff.role !== "MASTER";
  const { stats } = client;
  const allBookings = `/admin/bookings?period=all&q=${encodeURIComponent(client.phone.slice(1))}`;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/clients"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:min-h-0"
      >
        <ArrowLeft className="size-4" aria-hidden /> Все клиенты
      </Link>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {client.name}
          </h1>
          {client.tags.map((tag) => (
            <TagBadge key={tag.id} name={tag.name} color={tag.color} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <a
            href={`tel:${client.phone}`}
            className="inline-flex min-h-11 items-center gap-2 text-primary underline-offset-4 hover:underline sm:min-h-0"
          >
            <Phone className="size-4" aria-hidden />
            {formatPhone(client.phone)}
          </a>
          {client.email && (
            <a
              href={`mailto:${client.email}`}
              className="inline-flex min-h-11 items-center gap-2 text-primary underline-offset-4 hover:underline sm:min-h-0"
            >
              <Mail className="size-4" aria-hidden />
              {client.email}
            </a>
          )}
        </div>
        {manager && (
          <div className="flex flex-wrap gap-2">
            <Button asChild className="h-11 sm:h-8">
              <Link
                href={`/admin/bookings/new?phone=${encodeURIComponent(client.phone)}&name=${encodeURIComponent(client.name)}`}
              >
                <Plus aria-hidden /> Записать
              </Link>
            </Button>
            <EditClientButton
              clientId={client.id}
              defaults={{
                name: client.name,
                phone: formatPhone(client.phone),
                email: client.email ?? "",
                birthday: client.birthday
                  ? client.birthday.toISOString().slice(0, 10)
                  : "",
              }}
            />
            <DiscountButton
              clientId={client.id}
              defaults={{
                enabled: client.discountKind !== null,
                kind: client.discountKind ?? "PERCENT",
                value:
                  client.discountKind === "AMOUNT" && client.discountValue
                    ? kopecksToRubles(client.discountValue)
                    : client.discountValue,
              }}
            />
            <TagsButton
              clientId={client.id}
              tags={tags}
              selected={client.tags.map((tag) => tag.id)}
            />
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={manager ? "Визитов" : "Визитов к вам"}>
          {stats.visits}
        </Stat>
        <Stat label={manager ? "Оплачено за всё время" : "Ваша выручка"}>
          {formatMoney(stats.total)}
        </Stat>
        <Stat label="Средний чек">
          {stats.averageCheck === null ? "—" : formatMoney(stats.averageCheck)}
        </Stat>
        <Stat label="Последний визит">
          {stats.lastVisitAt ? formatSalonDate(stats.lastVisitAt) : "—"}
        </Stat>
        {manager && (
          <Stat label="Любимый мастер">
            {stats.favoriteMaster?.name ?? "—"}
          </Stat>
        )}
        <Stat label="Неявки">
          {stats.noShowRate === null
            ? "—"
            : `${Math.round(stats.noShowRate * 100)}%`}
        </Stat>
        <Stat label="Постоянная скидка">
          {client.discountKind && client.discountValue
            ? formatDiscount(client.discountKind, client.discountValue)
            : "нет"}
        </Stat>
        <Stat label="Записей впереди">{stats.upcoming || "—"}</Stat>
      </dl>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <Panel
          title={manager ? "Визиты" : "Визиты к вам"}
          action={
            client.bookings.length > VISITS_SHOWN && (
              <Link
                href={allBookings}
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Все записи: {client.bookings.length}
              </Link>
            )
          }
        >
          {client.bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Записей пока нет.</p>
          ) : (
            <ul className="divide-y">
              {client.bookings.slice(0, VISITS_SHOWN).map((booking) => (
                <li key={booking.id}>
                  <Link
                    href={`/admin/bookings/${booking.id}`}
                    className="flex flex-col gap-1 py-3 transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">
                        {formatSalonVisit(booking.startsAt)}
                      </span>
                      <span className="truncate text-sm text-muted-foreground">
                        {booking.services}
                        {manager && ` · ${booking.master.name}`}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <StatusBadge
                        status={booking.status}
                        totalPrice={booking.totalPrice}
                        paid={booking.paid}
                      />
                      <span className="ml-auto tabular-nums sm:w-20 sm:text-right">
                        {formatMoney(booking.totalPrice)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Заметки">
          <ClientNotes
            clientId={client.id}
            notes={client.notes.map((note) => ({
              id: note.id,
              text: note.text,
              author: note.author?.name ?? "сотрудник удалён",
              createdAt: formatSalonDayTime(note.createdAt),
              canDelete: manager || note.authorId === staff.id,
            }))}
          />
        </Panel>
      </div>

      <p className="text-sm text-muted-foreground">
        Клиент с {formatSalonDate(client.createdAt)}
        {client.birthday &&
          ` · день рождения ${formatBirthday(client.birthday)}`}
        {stats.visits > 0 &&
          ` · ${stats.visits} ${plural(stats.visits, ["визит", "визита", "визитов"])}`}
      </p>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
