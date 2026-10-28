import type { PrismaClient } from "@/generated/prisma/client";
import type { BookingStatus } from "@/generated/prisma/enums";
import { rublesToKopecks } from "@/lib/money";
import {
  addDays,
  minutesBetween,
  salonTimeToInstant,
  timeToMinutes,
  toSalonDate,
  toSalonMinutes,
  weekdayOf,
} from "@/lib/time";
import type {
  MasterProfileInput,
  MasterServiceInput,
  PromotionInput,
  TimeOffInput,
  WeekScheduleInput,
} from "@/lib/validation/masters";
import {
  assertOwnMaster,
  masterScope,
  type StaffUser,
} from "@/server/auth/access";
import { discountToRow } from "@/server/discount-input";
import { type Db, DomainError } from "@/server/errors";
import { deleteUpload, saveMasterPhoto } from "@/server/uploads";

// Мастера и всё, что к ним относится: профиль и фото (OWNER/ADMIN), цены, акции,
// график и отпуска (ещё и сам MASTER — только свои, DESIGN.md, раздел 4).
// Владение проверяется здесь, а не только в UI: assertOwnMaster в каждой функции.

const UPCOMING: BookingStatus[] = ["PENDING", "CONFIRMED"];
const RECENT_TIME_OFF_DAYS = 30;

export async function listMasters(db: Db, staff: StaffUser) {
  return db.master.findMany({
    where: masterScope(staff),
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      user: { select: { email: true } },
      _count: { select: { services: true } },
    },
  });
}

export async function getMasterDetail(
  db: Db,
  staff: StaffUser,
  masterId: string,
  now: Date,
) {
  assertOwnMaster(staff, masterId);
  return db.master.findUnique({
    where: { id: masterId },
    include: {
      user: { select: { id: true, name: true, email: true, isActive: true } },
      services: {
        include: {
          service: {
            select: {
              name: true,
              isActive: true,
              durationMin: true,
              price: true,
              category: { select: { name: true, sortOrder: true } },
            },
          },
        },
        orderBy: { service: { sortOrder: "asc" } },
      },
      promotions: {
        orderBy: { createdAt: "desc" },
        include: { service: { select: { name: true } } },
      },
      workingHours: { orderBy: [{ weekday: "asc" }, { startMin: "asc" }] },
      timeOffs: {
        where: {
          endsAt: {
            gte: salonTimeToInstant(
              addDays(toSalonDate(now), -RECENT_TIME_OFF_DAYS),
              0,
            ),
          },
        },
        orderBy: { startsAt: "asc" },
      },
    },
  });
}

/** Услуги салона для выбора при добавлении мастеру (с ценой и длительностью по умолчанию). */
export async function listServiceOptions(db: Db) {
  return db.service.findMany({
    where: { isActive: true },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    select: {
      id: true,
      name: true,
      price: true,
      durationMin: true,
      category: { select: { name: true } },
    },
  });
}

// ─────────── Профиль и фото (OWNER, ADMIN) ───────────

function profileData(input: MasterProfileInput) {
  return {
    name: input.name,
    title: input.title || null,
    bio: input.bio || null,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };
}

export async function createMaster(db: Db, input: MasterProfileInput) {
  return db.master.create({ data: profileData(input) });
}

export async function updateMasterProfile(
  db: Db,
  masterId: string,
  input: MasterProfileInput,
) {
  return db.master.update({
    where: { id: masterId },
    data: profileData(input),
  });
}

export async function setMasterPhoto(
  db: Db,
  uploadsDir: string,
  masterId: string,
  file: Buffer,
): Promise<string> {
  const master = await db.master.findUnique({
    where: { id: masterId },
    select: { photoPath: true },
  });
  if (!master) throw new DomainError("Мастер не найден");

  let photoPath: string;
  try {
    photoPath = await saveMasterPhoto(uploadsDir, masterId, file);
  } catch {
    throw new DomainError(
      "Не получилось прочитать изображение. Загрузите JPEG, PNG или WebP.",
      "photo",
    );
  }
  await db.master.update({ where: { id: masterId }, data: { photoPath } });
  await deleteUpload(uploadsDir, master.photoPath);
  return photoPath;
}

export async function removeMasterPhoto(
  db: Db,
  uploadsDir: string,
  masterId: string,
): Promise<void> {
  const master = await db.master.findUnique({
    where: { id: masterId },
    select: { photoPath: true },
  });
  if (!master) throw new DomainError("Мастер не найден");
  await db.master.update({
    where: { id: masterId },
    data: { photoPath: null },
  });
  await deleteUpload(uploadsDir, master.photoPath);
}

// ─────────── Услуги и цены мастера ───────────

export async function upsertMasterService(
  db: Db,
  staff: StaffUser,
  masterId: string,
  input: MasterServiceInput,
) {
  assertOwnMaster(staff, masterId);
  const service = await db.service.findUnique({
    where: { id: input.serviceId },
    select: { id: true },
  });
  if (!service) throw new DomainError("Услуга не найдена", "serviceId");

  const data = {
    price: rublesToKopecks(input.priceRub),
    durationMin: input.durationMin,
  };
  return db.masterService.upsert({
    where: { masterId_serviceId: { masterId, serviceId: input.serviceId } },
    create: { masterId, serviceId: input.serviceId, ...data },
    update: data,
  });
}

/** Прошлые записи не меняются: цены и длительности в них — снимки. */
export async function removeMasterService(
  db: Db,
  staff: StaffUser,
  masterId: string,
  serviceId: string,
) {
  assertOwnMaster(staff, masterId);
  await db.masterService.deleteMany({ where: { masterId, serviceId } });
}

// ─────────── Акции мастера ───────────

async function assertMasterOffers(db: Db, masterId: string, serviceId: string) {
  if (!serviceId) return;
  const offered = await db.masterService.findUnique({
    where: { masterId_serviceId: { masterId, serviceId } },
    select: { serviceId: true },
  });
  if (!offered) {
    throw new DomainError("Мастер не оказывает эту услугу", "serviceId");
  }
}

function promotionData(input: PromotionInput) {
  return {
    title: input.title,
    serviceId: input.serviceId || null,
    isActive: input.isActive,
    ...discountToRow(input),
  };
}

async function loadOwnPromotion(db: Db, staff: StaffUser, promotionId: string) {
  const promotion = await db.masterPromotion.findUnique({
    where: { id: promotionId },
    select: { masterId: true },
  });
  if (!promotion) throw new DomainError("Акция не найдена");
  assertOwnMaster(staff, promotion.masterId);
  return promotion;
}

export async function createPromotion(
  db: Db,
  staff: StaffUser,
  masterId: string,
  input: PromotionInput,
) {
  assertOwnMaster(staff, masterId);
  await assertMasterOffers(db, masterId, input.serviceId);
  return db.masterPromotion.create({
    data: { masterId, createdById: staff.id, ...promotionData(input) },
  });
}

export async function updatePromotion(
  db: Db,
  staff: StaffUser,
  promotionId: string,
  input: PromotionInput,
) {
  const { masterId } = await loadOwnPromotion(db, staff, promotionId);
  await assertMasterOffers(db, masterId, input.serviceId);
  return db.masterPromotion.update({
    where: { id: promotionId },
    data: promotionData(input),
  });
}

/** В записях ссылка на акцию обнуляется (SetNull), сама скидка в них сохранена. */
export async function deletePromotion(
  db: Db,
  staff: StaffUser,
  promotionId: string,
) {
  await loadOwnPromotion(db, staff, promotionId);
  await db.masterPromotion.delete({ where: { id: promotionId } });
}

// ─────────── График и отпуска ───────────

type ScheduleRow = { weekday: number; startMin: number; endMin: number };

function fitsSchedule(
  rows: readonly ScheduleRow[],
  booking: { startsAt: Date; endsAt: Date },
): boolean {
  const weekday = weekdayOf(toSalonDate(booking.startsAt));
  const start = toSalonMinutes(booking.startsAt);
  const end = start + minutesBetween(booking.startsAt, booking.endsAt);
  return rows.some(
    (row) =>
      row.weekday === weekday && row.startMin <= start && end <= row.endMin,
  );
}

/**
 * Заменяет недельный график целиком. Существующие записи не трогает, но
 * возвращает, сколько будущих записей оказались вне новых рабочих часов —
 * их нужно перенести вручную.
 */
export async function replaceWeekSchedule(
  db: PrismaClient,
  staff: StaffUser,
  masterId: string,
  input: WeekScheduleInput,
  now: Date,
): Promise<{ outside: number }> {
  assertOwnMaster(staff, masterId);
  const rows: ScheduleRow[] = input.days.flatMap((intervals, weekday) =>
    intervals.map((interval) => ({
      weekday,
      startMin: timeToMinutes(interval.start) ?? 0,
      endMin: timeToMinutes(interval.end) ?? 0,
    })),
  );

  await db.$transaction([
    db.workingHours.deleteMany({ where: { masterId } }),
    db.workingHours.createMany({
      data: rows.map((row) => ({ masterId, ...row })),
    }),
  ]);

  const upcoming = await db.booking.findMany({
    where: {
      masterId,
      deletedAt: null,
      status: { in: UPCOMING },
      startsAt: { gte: now },
    },
    select: { startsAt: true, endsAt: true },
  });
  return { outside: upcoming.filter((b) => !fitsSchedule(rows, b)).length };
}

/** Отпуск или перерыв. Возвращает, сколько будущих записей на него попадает. */
export async function createTimeOff(
  db: Db,
  staff: StaffUser,
  masterId: string,
  input: TimeOffInput,
): Promise<{ conflicts: number }> {
  assertOwnMaster(staff, masterId);
  const startsAt = input.allDay
    ? salonTimeToInstant(input.fromDate, 0)
    : salonTimeToInstant(input.fromDate, timeToMinutes(input.fromTime) ?? 0);
  const endsAt = input.allDay
    ? salonTimeToInstant(addDays(input.toDate, 1), 0)
    : salonTimeToInstant(input.toDate, timeToMinutes(input.toTime) ?? 0);
  if (endsAt <= startsAt) {
    throw new DomainError("Окончание раньше начала", "toTime");
  }

  await db.timeOff.create({
    data: { masterId, startsAt, endsAt, reason: input.reason || null },
  });
  const conflicts = await db.booking.count({
    where: {
      masterId,
      deletedAt: null,
      status: { in: UPCOMING },
      startsAt: { lt: endsAt },
      blockedUntil: { gt: startsAt },
    },
  });
  return { conflicts };
}

export async function deleteTimeOff(
  db: Db,
  staff: StaffUser,
  timeOffId: string,
) {
  const timeOff = await db.timeOff.findUnique({
    where: { id: timeOffId },
    select: { masterId: true },
  });
  if (!timeOff) throw new DomainError("Отсутствие не найдено");
  assertOwnMaster(staff, timeOff.masterId);
  await db.timeOff.delete({ where: { id: timeOffId } });
}
