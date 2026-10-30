import type { Prisma } from "@/generated/prisma/client";
import type { BookingStatus } from "@/generated/prisma/enums";
import {
  addDays,
  type DateString,
  formatSalonTime,
  MINUTES_PER_DAY,
  minutesBetween,
  salonTimeToInstant,
  toSalonDate,
  weekdayOf,
} from "@/lib/time";
import {
  bookingScope,
  masterScope,
  type StaffUser,
} from "@/server/auth/access";
import type { BookingPeriod } from "@/lib/validation/staff-booking";
import type { Db } from "@/server/errors";
import { ACTIVE_BOOKING_STATUSES } from "./status";

// Чтение записей для CRM (DESIGN.md, 8.4 и раздел 4). MASTER получает только свои
// записи: bookingScope подмешивается в каждый where.

function dayRange(date: DateString) {
  return {
    gte: salonTimeToInstant(date, 0),
    lt: salonTimeToInstant(date, MINUTES_PER_DAY),
  };
}

const sumPaid = (payments: readonly { amount: number }[]) =>
  payments.reduce((sum, row) => sum + row.amount, 0);

// ── Расписание дня по мастерам ───────────────────────────────────────────────

export type BoardBooking = {
  id: string;
  // Минуты от полуночи дня по часам салона, обрезанные границами суток: визит
  // 23:30–01:00 виден и вечером, и после полуночи следующего дня.
  startMin: number;
  endMin: number;
  start: string; // настоящее время начала и конца — «23:30»
  end: string;
  status: BookingStatus;
  clientName: string;
  services: string;
  totalPrice: number;
  paid: number;
};

export type BoardColumn = {
  master: { id: string; name: string; photoPath: string | null };
  workingHours: { startMin: number; endMin: number }[];
  timeOffs: { startMin: number; endMin: number }[];
  bookings: BoardBooking[];
};

export type DayBoard = {
  date: DateString;
  fromMin: number; // видимый диапазон сетки, по целым часам
  toMin: number;
  columns: BoardColumn[];
};

/**
 * Записи дня по колонкам мастеров. Отменённые не показываются — они не занимают
 * время; неявки остаются (визит был в расписании). Мастер без графика и записей
 * в этот день всё равно получает колонку: к нему можно записать.
 */
export async function loadDayBoard(
  db: Db,
  staff: StaffUser,
  date: DateString,
): Promise<DayBoard> {
  const range = dayRange(date);
  const dayStart = range.gte;
  const bookingWhere: Prisma.BookingWhereInput = {
    ...bookingScope(staff),
    deletedAt: null,
    status: { not: "CANCELLED" },
    // Пересечение с днём, а не начало в этот день: ночной визит занят и после полуночи.
    startsAt: { lt: range.lt },
    endsAt: { gt: range.gte },
  };
  const masters = await db.master.findMany({
    where: {
      ...masterScope(staff),
      OR: [{ isActive: true }, { bookings: { some: bookingWhere } }],
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      photoPath: true,
      workingHours: {
        where: { weekday: weekdayOf(date) },
        orderBy: { startMin: "asc" },
        select: { startMin: true, endMin: true },
      },
      timeOffs: {
        where: { startsAt: { lt: range.lt }, endsAt: { gt: range.gte } },
        select: { startsAt: true, endsAt: true },
      },
      bookings: {
        where: bookingWhere,
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          totalPrice: true,
          client: { select: { name: true } },
          items: {
            orderBy: { sortOrder: "asc" },
            select: { serviceName: true },
          },
          payments: { select: { amount: true } },
        },
      },
    },
  });

  const toMin = (instant: Date) => minutesBetween(dayStart, instant);
  const columns: BoardColumn[] = masters.map((master) => ({
    master: { id: master.id, name: master.name, photoPath: master.photoPath },
    workingHours: master.workingHours,
    timeOffs: master.timeOffs.map((off) => ({
      startMin: Math.max(0, toMin(off.startsAt)),
      endMin: Math.min(MINUTES_PER_DAY, toMin(off.endsAt)),
    })),
    bookings: master.bookings.map((booking) => ({
      id: booking.id,
      startMin: Math.max(0, toMin(booking.startsAt)),
      endMin: Math.min(MINUTES_PER_DAY, toMin(booking.endsAt)),
      start: formatSalonTime(booking.startsAt),
      end: formatSalonTime(booking.endsAt),
      status: booking.status,
      clientName: booking.client.name,
      services: booking.items.map((item) => item.serviceName).join(", "),
      totalPrice: booking.totalPrice,
      paid: sumPaid(booking.payments),
    })),
  }));

  const starts = columns.flatMap((column) => [
    ...column.workingHours.map((row) => row.startMin),
    ...column.bookings.map((row) => row.startMin),
  ]);
  const ends = columns.flatMap((column) => [
    ...column.workingHours.map((row) => row.endMin),
    ...column.bookings.map((row) => row.endMin),
  ]);
  const hour = 60;
  return {
    date,
    fromMin: Math.floor(Math.min(10 * hour, ...starts) / hour) * hour,
    toMin: Math.min(
      MINUTES_PER_DAY,
      Math.ceil(Math.max(20 * hour, ...ends) / hour) * hour,
    ),
    columns,
  };
}

// ── «Сегодня» ────────────────────────────────────────────────────────────────

export type TodayStats = {
  bookings: number;
  pending: number;
  // Выручка дня: OWNER — оплаты салона, MASTER — его услуги в состоявшихся визитах
  // (8.3). ADMIN выручку не видит (раздел 4) — null.
  revenue: number | null;
  next: { id: string; startsAt: Date; clientName: string } | null;
};

export async function loadTodayStats(
  db: Db,
  staff: StaffUser,
  now: Date,
): Promise<TodayStats> {
  const today = dayRange(toSalonDate(now));
  const scope = { ...bookingScope(staff), deletedAt: null };
  const [bookings, pending, next, revenue] = await Promise.all([
    db.booking.count({
      where: {
        ...scope,
        status: { in: ACTIVE_BOOKING_STATUSES },
        startsAt: today,
      },
    }),
    db.booking.count({
      where: { ...scope, status: "PENDING", startsAt: { gte: today.gte } },
    }),
    db.booking.findFirst({
      where: {
        ...scope,
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { gte: now },
      },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true, client: { select: { name: true } } },
    }),
    dayRevenue(db, staff, today),
  ]);
  return {
    bookings,
    pending,
    revenue,
    next: next
      ? { id: next.id, startsAt: next.startsAt, clientName: next.client.name }
      : null,
  };
}

async function dayRevenue(
  db: Db,
  staff: StaffUser,
  range: { gte: Date; lt: Date },
): Promise<number | null> {
  if (staff.role === "OWNER") {
    const paid = await db.payment.aggregate({
      where: { booking: { deletedAt: null, startsAt: range } },
      _sum: { amount: true },
    });
    return paid._sum.amount ?? 0;
  }
  if (staff.role === "MASTER") {
    const own = await db.bookingItem.aggregate({
      where: {
        booking: {
          ...bookingScope(staff),
          deletedAt: null,
          status: "COMPLETED",
          startsAt: range,
        },
      },
      _sum: { price: true },
    });
    return own._sum.price ?? 0;
  }
  return null;
}

/** Заявки с сайта, которые ждут подтверждения: с сегодняшнего дня, ближайшие первыми. */
export async function loadPendingRequests(
  db: Db,
  staff: StaffUser,
  now: Date,
  take = 20,
) {
  const rows = await db.booking.findMany({
    where: {
      ...bookingScope(staff),
      deletedAt: null,
      status: "PENDING",
      startsAt: { gte: dayRange(toSalonDate(now)).gte },
    },
    orderBy: { startsAt: "asc" },
    take,
    select: {
      id: true,
      startsAt: true,
      totalPrice: true,
      clientComment: true,
      client: { select: { name: true, phone: true } },
      master: { select: { name: true } },
      items: { orderBy: { sortOrder: "asc" }, select: { serviceName: true } },
    },
  });
  return rows.map(({ items, ...row }) => ({
    ...row,
    services: items.map((item) => item.serviceName).join(", "),
  }));
}
export type PendingRequest = Awaited<
  ReturnType<typeof loadPendingRequests>
>[number];

// ── Список записей ───────────────────────────────────────────────────────────

export const BOOKINGS_PAGE_SIZE = 20;

export type BookingListFilters = {
  period: BookingPeriod;
  status: BookingStatus | null;
  masterId: string | null;
  query: string; // имя или цифры телефона
  page: number; // с 1
};

export async function listBookings(
  db: Db,
  staff: StaffUser,
  filters: BookingListFilters,
  now: Date,
) {
  const todayStart = dayRange(toSalonDate(now)).gte;
  const query = filters.query.trim();
  const digits = query.replace(/\D/g, "");
  const where: Prisma.BookingWhereInput = {
    // Через AND: фильтр по мастеру из адреса не должен перезаписать ограничение MASTER.
    AND: [bookingScope(staff)],
    deletedAt: null,
    ...(filters.status && { status: filters.status }),
    ...(filters.masterId && { masterId: filters.masterId }),
    ...(filters.period === "upcoming" && { startsAt: { gte: todayStart } }),
    ...(filters.period === "past" && { startsAt: { lt: todayStart } }),
    ...(query && {
      client: {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        ],
      },
    }),
  };
  const total = await db.booking.count({ where });
  // Номер страницы из адреса за пределами списка сводится к последней странице.
  const pageCount = Math.max(1, Math.ceil(total / BOOKINGS_PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const rows = await db.booking.findMany({
    where,
    orderBy: {
      startsAt: filters.period === "upcoming" ? "asc" : "desc",
    },
    skip: (page - 1) * BOOKINGS_PAGE_SIZE,
    take: BOOKINGS_PAGE_SIZE,
    select: {
      id: true,
      startsAt: true,
      status: true,
      source: true,
      totalPrice: true,
      client: { select: { name: true, phone: true } },
      master: { select: { name: true } },
      items: { orderBy: { sortOrder: "asc" }, select: { serviceName: true } },
      payments: { select: { amount: true } },
    },
  });
  return {
    total,
    page,
    pageCount,
    rows: rows.map(({ items, payments, ...row }) => ({
      ...row,
      services: items.map((item) => item.serviceName).join(", "),
      paid: sumPaid(payments),
    })),
  };
}
export type BookingListRow = Awaited<
  ReturnType<typeof listBookings>
>["rows"][number];

// ── Карточка записи ──────────────────────────────────────────────────────────

export async function getBookingDetail(db: Db, staff: StaffUser, id: string) {
  return db.booking.findFirst({
    where: { id, deletedAt: null, ...bookingScope(staff) },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      durationMin: true,
      isDurationManual: true,
      bufferMin: true,
      status: true,
      source: true,
      subtotal: true,
      salonDiscount: true,
      salonDiscountSource: true,
      totalPrice: true,
      clientComment: true,
      confirmedAt: true,
      cancelledAt: true,
      cancelledBy: true,
      createdAt: true,
      updatedAt: true,
      masterId: true,
      createdBy: { select: { name: true } },
      client: {
        select: {
          id: true,
          name: true,
          phone: true,
          discountKind: true,
          discountValue: true,
        },
      },
      master: { select: { id: true, name: true, photoPath: true } },
      promoCode: { select: { code: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          serviceId: true,
          serviceName: true,
          basePrice: true,
          masterDiscount: true,
          price: true,
          isPriceManual: true,
          durationMin: true,
          promotionId: true,
        },
      },
      payments: {
        orderBy: { paidAt: "asc" },
        select: { id: true, amount: true, method: true, paidAt: true },
      },
    },
  });
}
export type BookingDetail = NonNullable<
  Awaited<ReturnType<typeof getBookingDetail>>
>;

/** Мастера с их услугами и ценами — для формы ручной записи и переноса. */
export async function loadBookingFormMasters(db: Db) {
  const masters = await db.master.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      services: {
        where: { service: { isActive: true } },
        orderBy: [
          { service: { category: { sortOrder: "asc" } } },
          { service: { sortOrder: "asc" } },
        ],
        select: {
          price: true,
          durationMin: true,
          service: {
            select: {
              id: true,
              name: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  return masters.map((master) => ({
    id: master.id,
    name: master.name,
    services: master.services.map((row) => ({
      id: row.service.id,
      name: row.service.name,
      category: row.service.category.name,
      price: row.price,
      durationMin: row.durationMin,
    })),
  }));
}
export type BookingFormMaster = Awaited<
  ReturnType<typeof loadBookingFormMasters>
>[number];

/** Дата для ссылок «на этот день» и проверки параметра `date` из адреса. */
export function boardDate(raw: string | undefined, now: Date): DateString {
  const today = toSalonDate(now);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return today;
  try {
    // addDays проверяет календарь: 2026-02-31 не пройдёт.
    return addDays(raw, 0);
  } catch {
    return today;
  }
}

/**
 * Мастера, которым можно передать запись: делают все её услуги. Текущий мастер есть
 * в списке, даже если его уже отключили.
 */
export async function loadTransferMasters(
  db: Db,
  booking: { masterId: string; master: { name: string } },
  serviceIds: readonly string[],
) {
  const masters = await db.master.findMany({
    where: {
      isActive: true,
      AND: serviceIds.map((serviceId) => ({
        services: { some: { serviceId } },
      })),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  return masters.some((master) => master.id === booking.masterId)
    ? masters
    : [{ id: booking.masterId, name: booking.master.name }, ...masters];
}
