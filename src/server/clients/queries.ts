import type { Prisma } from "@/generated/prisma/client";
import type { ClientSegment } from "@/lib/validation/clients";
import {
  bookingScope,
  clientScope,
  type StaffUser,
} from "@/server/auth/access";
import type { Db } from "@/server/errors";
import { clientStats } from "./stats";

// Чтение клиентской базы (DESIGN.md, 8.1–8.2). MASTER видит только клиентов своих
// записей, а их визиты и цифры — только по своим записям.

const DAY_MS = 24 * 60 * 60_000;
/** «Давно не был»: последний визит раньше, будущих записей нет (как «спящие» в 8.3). */
export const SLEEPING_AFTER_DAYS = 45;
/** «Новые»: первый визит в последние 30 дней. */
export const NEW_WITHIN_DAYS = 30;
export const CLIENTS_PAGE_SIZE = 20;

/** Записи клиента, которые видит сотрудник: не удалённые, у MASTER — только свои. */
function visitScope(staff: StaffUser): Prisma.BookingWhereInput {
  return { deletedAt: null, ...bookingScope(staff) };
}

/**
 * Сколько визит принёс: салону — оплаты, мастеру — цены его услуг (8.3). Так у
 * MASTER в карточке не видны деньги салона.
 */
function visitAmount(
  staff: StaffUser,
  booking: {
    payments: { amount: number }[];
    items: { price: number }[];
  },
): number {
  const rows =
    staff.role === "MASTER"
      ? booking.items.map((item) => item.price)
      : booking.payments.map((payment) => payment.amount);
  return rows.reduce((sum, value) => sum + value, 0);
}

const visitSelect = {
  status: true,
  startsAt: true,
  master: { select: { id: true, name: true } },
  payments: { select: { amount: true } },
  items: { select: { price: true } },
} as const satisfies Prisma.BookingSelect;

export type ClientListFilters = {
  query: string;
  tagId: string | null;
  masterId: string | null;
  segment: ClientSegment;
  page: number;
};

export async function listClients(
  db: Db,
  staff: StaffUser,
  filters: ClientListFilters,
  now: Date,
) {
  const visits = visitScope(staff);
  const query = filters.query.trim();
  const digits = query.replace(/\D/g, "");
  const conditions: Prisma.ClientWhereInput[] = [clientScope(staff)];
  if (query) {
    conditions.push({
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ],
    });
  }
  if (filters.tagId) {
    conditions.push({ tags: { some: { tagId: filters.tagId } } });
  }
  if (filters.masterId) {
    conditions.push({
      // AND, а не spread: masterId из адреса не должен перезаписать ограничение MASTER.
      bookings: { some: { AND: [visits, { masterId: filters.masterId }] } },
    });
  }
  if (filters.segment === "sleeping") {
    const since = new Date(now.getTime() - SLEEPING_AFTER_DAYS * DAY_MS);
    conditions.push(
      { bookings: { some: { ...visits, status: "COMPLETED" } } },
      {
        bookings: {
          none: { ...visits, status: "COMPLETED", startsAt: { gte: since } },
        },
      },
      {
        bookings: {
          none: {
            ...visits,
            status: { in: ["PENDING", "CONFIRMED"] },
            startsAt: { gte: now },
          },
        },
      },
    );
  }
  if (filters.segment === "new") {
    const since = new Date(now.getTime() - NEW_WITHIN_DAYS * DAY_MS);
    conditions.push(
      {
        bookings: {
          some: { ...visits, status: "COMPLETED", startsAt: { gte: since } },
        },
      },
      {
        bookings: {
          none: { ...visits, status: "COMPLETED", startsAt: { lt: since } },
        },
      },
    );
  }
  // Через AND: фильтр мастера из адреса не снимает ограничение MASTER.
  const where: Prisma.ClientWhereInput = { AND: conditions };

  const total = await db.client.count({ where });
  // Номер страницы из адреса за пределами списка сводится к последней странице.
  const pageCount = Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const rows = await db.client.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: (page - 1) * CLIENTS_PAGE_SIZE,
    take: CLIENTS_PAGE_SIZE,
    select: {
      id: true,
      name: true,
      phone: true,
      discountKind: true,
      discountValue: true,
      tags: {
        orderBy: { tag: { name: "asc" } },
        select: { tag: { select: { id: true, name: true, color: true } } },
      },
      bookings: { where: visits, select: visitSelect },
    },
  });

  return {
    total,
    page,
    pageCount,
    rows: rows.map(({ bookings, tags, ...client }) => {
      const stats = clientStats(
        bookings.map((booking) => ({
          ...booking,
          amount: visitAmount(staff, booking),
        })),
        now,
      );
      return {
        ...client,
        tags: tags.map((row) => row.tag),
        visits: stats.visits,
        lastVisitAt: stats.lastVisitAt,
        total: stats.total,
        upcoming: stats.upcoming,
      };
    }),
  };
}
export type ClientListRow = Awaited<
  ReturnType<typeof listClients>
>["rows"][number];

export async function getClientDetail(
  db: Db,
  staff: StaffUser,
  id: string,
  now: Date,
) {
  const visits = visitScope(staff);
  const client = await db.client.findFirst({
    where: { AND: [{ id }, clientScope(staff)] },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      birthday: true,
      discountKind: true,
      discountValue: true,
      createdAt: true,
      tags: {
        orderBy: { tag: { name: "asc" } },
        select: { tag: { select: { id: true, name: true, color: true } } },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          text: true,
          createdAt: true,
          authorId: true,
          author: { select: { name: true } },
        },
      },
      bookings: {
        where: visits,
        orderBy: { startsAt: "desc" },
        select: {
          ...visitSelect,
          id: true,
          totalPrice: true,
          items: {
            orderBy: { sortOrder: "asc" },
            select: { price: true, serviceName: true },
          },
        },
      },
    },
  });
  if (!client) return null;
  const { bookings, tags, ...rest } = client;
  return {
    ...rest,
    tags: tags.map((row) => row.tag),
    stats: clientStats(
      bookings.map((booking) => ({
        ...booking,
        amount: visitAmount(staff, booking),
      })),
      now,
    ),
    bookings: bookings.map((booking) => ({
      id: booking.id,
      startsAt: booking.startsAt,
      status: booking.status,
      master: booking.master,
      services: booking.items.map((item) => item.serviceName).join(", "),
      totalPrice: booking.totalPrice,
      paid: booking.payments.reduce((sum, row) => sum + row.amount, 0),
    })),
  };
}
export type ClientDetail = NonNullable<
  Awaited<ReturnType<typeof getClientDetail>>
>;

/** Все теги с числом клиентов — для фильтра и выбора в карточке. */
export async function listTags(db: Db) {
  const tags = await db.tag.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      _count: { select: { clients: true } },
    },
  });
  return tags.map(({ _count, ...tag }) => ({
    ...tag,
    clients: _count.clients,
  }));
}
export type TagOption = Awaited<ReturnType<typeof listTags>>[number];
