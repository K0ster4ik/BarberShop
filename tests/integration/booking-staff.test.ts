import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  addDays,
  addMinutes,
  formatSalonTime,
  salonTimeToInstant,
  toSalonDate,
} from "@/lib/time";
import {
  type StaffBookingInput,
  staffBookingSchema,
} from "@/lib/validation/staff-booking";
import { ForbiddenError, type StaffUser } from "@/server/auth/access";
import {
  addPayment,
  BOOKING_CHANGED,
  changeBookingStatus,
  createStaffBooking,
  deleteBooking,
  MASTER_BUSY,
  quoteBookingUpdate,
  STAFF_BOOKING_NOT_FOUND,
  staffFreeTimes,
  updateStaffBooking,
} from "@/server/bookings/staff";
import {
  listBookings,
  loadDayBoard,
  loadTodayStats,
} from "@/server/bookings/staff-queries";
import { DomainError } from "@/server/errors";
import { seedDemo, TEST_NOW } from "./fixtures";
import { createTestDb } from "./test-db";

// Записи в CRM на настоящей БД (DESIGN.md, 7.3–7.6, раздел 4).

let db: PrismaClient;
let owner: StaffUser;
let master: StaffUser;
let ownMasterId: string;
let otherMasterId: string;
let haircutId: string;
const admin: StaffUser = {
  id: "demo-user-admin",
  name: "Мария Лебедева",
  email: "admin@demo.ru",
  role: "ADMIN",
  masterId: null,
};
const today = toSalonDate(TEST_NOW);
const tomorrow = addDays(today, 1);

beforeAll(() => {
  db = createTestDb();
});
afterAll(async () => {
  await db.$disconnect();
});
beforeEach(async () => {
  ({ owner, master, ownMasterId, otherMasterId } = await seedDemo(db));
  haircutId = (
    await db.service.findFirstOrThrow({ where: { name: "Мужская стрижка" } })
  ).id;
});

let phoneSeq = 0;
function nextPhone() {
  phoneSeq += 1;
  return `+7 901 ${String(phoneSeq).padStart(7, "0")}`;
}

function input(overrides: Partial<StaffBookingInput> = {}): StaffBookingInput {
  return staffBookingSchema.parse({
    phone: nextPhone(),
    name: "Пётр Звонков",
    masterId: ownMasterId,
    serviceIds: [haircutId],
    date: tomorrow,
    time: "12:00",
    durationMin: null,
    source: "PHONE",
    comment: "",
    promoCode: "",
    discount: { mode: "auto", kind: "PERCENT", value: null },
    prices: {},
    ...overrides,
  });
}

/** Свободное время мастера на день; `now` — раньше дня, чтобы утро не отсекалось. */
async function free(masterId: string, date: string, now = TEST_NOW) {
  return staffFreeTimes(
    db,
    owner,
    { masterId, date, serviceIds: [haircutId] },
    now,
  );
}

async function freeTime(masterId: string, date = tomorrow) {
  const [time] = await free(masterId, date);
  if (!time) throw new Error(`No free time for ${masterId} on ${date}`);
  return time;
}

/** updatedAt записи — версия, с которой «открыли форму». */
async function versionOf(id: string) {
  return (await db.booking.findUniqueOrThrow({ where: { id } })).updatedAt;
}

async function errorOf(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: unknown) => {
      if (error instanceof DomainError) return error.message;
      if (error instanceof ForbiddenError) return "forbidden";
      throw error;
    },
  );
}

/**
 * Запись сегодня, которая уже началась к TEST_NOW (14:30). Демо-утро занято, поэтому
 * время до открытия: админ может записать и вне графика.
 */
async function startedBooking(masterId = ownMasterId, time = "08:00") {
  return createStaffBooking(
    db,
    owner,
    input({ masterId, date: today, time }),
    salonTimeToInstant(today, 0),
  );
}

describe("createStaffBooking", () => {
  it("creates a confirmed booking without a notification and keeps a known client's name", async () => {
    const existing = await db.client.findFirstOrThrow();
    const time = await freeTime(ownMasterId);
    const { id } = await createStaffBooking(
      db,
      owner,
      input({ time, phone: existing.phone, name: "Другое Имя" }),
      TEST_NOW,
    );
    const booking = await db.booking.findUniqueOrThrow({
      where: { id },
      include: { notifications: true, client: true, items: true },
    });
    expect(booking).toMatchObject({
      status: "CONFIRMED",
      source: "PHONE",
      createdById: owner.id,
      cancelTokenHash: null,
      isDurationManual: false,
    });
    expect(booking.confirmedAt).toEqual(TEST_NOW);
    expect(booking.notifications).toHaveLength(0);
    expect(booking.client.name).toBe(existing.name);
  });

  it("applies manual prices, a manual discount and a manual duration", async () => {
    const time = await freeTime(ownMasterId);
    const { id } = await createStaffBooking(
      db,
      owner,
      input({
        time,
        durationMin: 50,
        prices: { [haircutId]: 1500 },
        discount: { mode: "manual", kind: "AMOUNT", value: 200 },
      }),
      TEST_NOW,
    );
    const booking = await db.booking.findUniqueOrThrow({
      where: { id },
      include: { items: true },
    });
    expect(booking).toMatchObject({
      durationMin: 50,
      isDurationManual: true,
      subtotal: 150_000,
      salonDiscount: 20_000,
      salonDiscountSource: "MANUAL",
      totalPrice: 130_000,
    });
    expect(booking.endsAt).toEqual(addMinutes(booking.startsAt, 50));
    expect(booking.items[0]).toMatchObject({
      price: 150_000,
      isPriceManual: true,
      masterDiscount: 0,
    });
  });

  it("allows time outside the schedule but not over another booking", async () => {
    const late = await createStaffBooking(
      db,
      owner,
      input({ time: "23:00" }),
      TEST_NOW,
    );
    expect(late.id).toBeTruthy();
    expect(
      await errorOf(
        createStaffBooking(db, owner, input({ time: "23:15" }), TEST_NOW),
      ),
    ).toBe(MASTER_BUSY);
  });

  it("is not available to a master", async () => {
    expect(
      await errorOf(createStaffBooking(db, master, input(), TEST_NOW)),
    ).toBe("forbidden");
  });

  it("refuses a promo code that does not work instead of dropping it silently", async () => {
    const time = await freeTime(ownMasterId);
    expect(
      await errorOf(
        createStaffBooking(
          db,
          owner,
          input({ time, promoCode: "SUMMER15" }),
          TEST_NOW,
        ),
      ),
    ).toBe("Срок действия промокода закончился");
  });
});

describe("updateStaffBooking", () => {
  it("keeps the price snapshot when only the time changes", async () => {
    const time = await freeTime(ownMasterId);
    const { id } = await createStaffBooking(
      db,
      owner,
      input({ time }),
      TEST_NOW,
    );
    const before = await db.booking.findUniqueOrThrow({ where: { id } });
    // Прайс мастера подняли после записи — запись это не трогает.
    await db.masterService.update({
      where: {
        masterId_serviceId: { masterId: ownMasterId, serviceId: haircutId },
      },
      data: { price: { increment: 50_000 } },
    });
    const later = "21:30"; // после закрытия: точно свободно
    await updateStaffBooking(
      db,
      admin,
      id,
      await versionOf(id),
      {
        masterId: ownMasterId,
        date: tomorrow,
        time: later,
        durationMin: null,
        discount: { mode: "none", kind: "PERCENT", value: null },
        prices: {},
      },
      TEST_NOW,
    );
    const after = await db.booking.findUniqueOrThrow({ where: { id } });
    expect(after.totalPrice).toBe(before.totalPrice);
    expect(after.status).toBe("CONFIRMED");
    expect(toSalonDate(after.startsAt)).toBe(tomorrow);
    expect(after.startsAt).not.toEqual(before.startsAt);
  });

  it("reprices by the new master's price list but keeps manual prices", async () => {
    const time = await freeTime(ownMasterId);
    const { id } = await createStaffBooking(
      db,
      owner,
      input({ time }),
      TEST_NOW,
    );
    const item = await db.bookingItem.findFirstOrThrow({
      where: { bookingId: id },
    });
    const otherPrice = await db.masterService.findUniqueOrThrow({
      where: {
        masterId_serviceId: { masterId: otherMasterId, serviceId: haircutId },
      },
    });
    const otherTime = await freeTime(otherMasterId);
    const update = {
      masterId: otherMasterId,
      date: tomorrow,
      time: otherTime,
      durationMin: null,
      discount: {
        mode: "none" as const,
        kind: "PERCENT" as const,
        value: null,
      },
      prices: {},
    };

    const quote = await quoteBookingUpdate(db, owner, id, update, TEST_NOW);
    expect(quote.items[0]?.basePrice).toBe(otherPrice.price);
    expect(quote.durationMin).toBe(otherPrice.durationMin);

    await updateStaffBooking(
      db,
      owner,
      id,
      await versionOf(id),
      { ...update, prices: { [item.id]: 999 } },
      TEST_NOW,
    );
    const moved = await db.booking.findUniqueOrThrow({
      where: { id },
      include: { items: true },
    });
    expect(moved.masterId).toBe(otherMasterId);
    expect(moved.items[0]).toMatchObject({
      basePrice: otherPrice.price,
      price: 99_900,
      isPriceManual: true,
    });
    expect(moved.totalPrice).toBe(99_900);
  });

  it("does not move a booking onto another one", async () => {
    const a = await createStaffBooking(
      db,
      owner,
      input({ time: "21:00" }),
      TEST_NOW,
    );
    await createStaffBooking(db, owner, input({ time: "22:30" }), TEST_NOW);
    const move = (time: string) => ({
      masterId: ownMasterId,
      date: tomorrow,
      time,
      durationMin: null,
      discount: {
        mode: "none" as const,
        kind: "PERCENT" as const,
        value: null,
      },
      prices: {},
    });
    // Форма предупреждает заранее; своё же время записи пересечением не считается.
    expect(
      (await quoteBookingUpdate(db, owner, a.id, move("22:00"), TEST_NOW))
        .overlaps,
    ).toBe(true);
    expect(
      (await quoteBookingUpdate(db, owner, a.id, move("21:10"), TEST_NOW))
        .overlaps,
    ).toBe(false);
    expect(
      await errorOf(
        updateStaffBooking(
          db,
          owner,
          a.id,
          await versionOf(a.id),
          move("22:00"),
          TEST_NOW,
        ),
      ),
    ).toBe(MASTER_BUSY);
  });

  it("is not available to a master, even for their own booking", async () => {
    const time = await freeTime(ownMasterId);
    const { id } = await createStaffBooking(
      db,
      owner,
      input({ time }),
      TEST_NOW,
    );
    expect(
      await errorOf(
        updateStaffBooking(
          db,
          master,
          id,
          await versionOf(id),
          {
            masterId: ownMasterId,
            date: tomorrow,
            time,
            durationMin: 90,
            discount: { mode: "none", kind: "PERCENT", value: null },
            prices: {},
          },
          TEST_NOW,
        ),
      ),
    ).toBe("forbidden");
  });
});

describe("changeBookingStatus", () => {
  it("lets a master change only their own bookings", async () => {
    const own = await startedBooking(ownMasterId);
    const other = await startedBooking(otherMasterId);
    expect(
      await errorOf(
        changeBookingStatus(
          db,
          master,
          other.id,
          { to: "COMPLETED", payment: null },
          TEST_NOW,
        ),
      ),
    ).toBe(STAFF_BOOKING_NOT_FOUND);
    await changeBookingStatus(
      db,
      master,
      own.id,
      { to: "COMPLETED", payment: { amount: 500, method: "CASH" } },
      TEST_NOW,
    );
    const done = await db.booking.findUniqueOrThrow({
      where: { id: own.id },
      include: { payments: true },
    });
    expect(done.status).toBe("COMPLETED");
    expect(done.payments).toMatchObject([{ amount: 50_000, method: "CASH" }]);
  });

  it("marks a visit only after it started and lets a manager fix came ↔ did not come", async () => {
    const future = await createStaffBooking(
      db,
      owner,
      input({ time: await freeTime(ownMasterId) }),
      TEST_NOW,
    );
    expect(
      await errorOf(
        changeBookingStatus(
          db,
          owner,
          future.id,
          { to: "NO_SHOW", payment: null },
          TEST_NOW,
        ),
      ),
    ).toBe("Отметить визит можно только после его начала.");

    const started = await startedBooking();
    await changeBookingStatus(
      db,
      master,
      started.id,
      { to: "NO_SHOW", payment: null },
      TEST_NOW,
    );
    expect(
      await errorOf(
        changeBookingStatus(
          db,
          master,
          started.id,
          { to: "COMPLETED", payment: null },
          TEST_NOW,
        ),
      ),
    ).toBe("Исправить отметку о визите может администратор.");
    await changeBookingStatus(
      db,
      admin,
      started.id,
      { to: "COMPLETED", payment: null },
      TEST_NOW,
    );
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: started.id } }))
        .status,
    ).toBe("COMPLETED");
  });

  it("notifies the channel when staff cancel a website booking, and only then", async () => {
    const website = await db.booking.findFirstOrThrow({
      where: {
        source: "WEBSITE",
        status: "PENDING",
        startsAt: { gt: TEST_NOW },
        deletedAt: null,
      },
    });
    const result = await changeBookingStatus(
      db,
      owner,
      website.id,
      { to: "CANCELLED", payment: null },
      TEST_NOW,
    );
    expect(result.notificationId).toBeTruthy();
    const cancelled = await db.booking.findUniqueOrThrow({
      where: { id: website.id },
    });
    expect(cancelled).toMatchObject({
      status: "CANCELLED",
      cancelledBy: "STAFF",
    });

    const phone = await createStaffBooking(
      db,
      owner,
      input({ time: await freeTime(ownMasterId) }),
      TEST_NOW,
    );
    const silent = await changeBookingStatus(
      db,
      owner,
      phone.id,
      { to: "CANCELLED", payment: null },
      TEST_NOW,
    );
    expect(silent.notificationId).toBeNull();
  });

  it("changes the status once when two staff press the button together", async () => {
    const pending = await db.booking.findFirstOrThrow({
      where: { status: "PENDING", startsAt: { gt: TEST_NOW }, deletedAt: null },
    });
    const results = await Promise.all([
      errorOf(
        changeBookingStatus(
          db,
          owner,
          pending.id,
          { to: "CANCELLED", payment: null },
          TEST_NOW,
        ),
      ),
      errorOf(
        changeBookingStatus(
          db,
          admin,
          pending.id,
          { to: "CANCELLED", payment: null },
          TEST_NOW,
        ),
      ),
    ]);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    expect(
      await db.notification.count({
        where: { bookingId: pending.id, type: "BOOKING_CANCELLED" },
      }),
    ).toBeLessThanOrEqual(1);
  });
});

describe("payments", () => {
  it("never lets payments exceed the total, even in parallel", async () => {
    const { id } = await startedBooking();
    await changeBookingStatus(
      db,
      owner,
      id,
      { to: "COMPLETED", payment: null },
      TEST_NOW,
    );
    const { totalPrice } = await db.booking.findUniqueOrThrow({
      where: { id },
    });
    const part = (totalPrice / 100) * 0.6;
    const results = await Promise.all([
      errorOf(
        addPayment(db, owner, id, { amount: part, method: "CARD" }, TEST_NOW),
      ),
      errorOf(
        addPayment(db, master, id, { amount: part, method: "CASH" }, TEST_NOW),
      ),
    ]);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    const paid = await db.payment.aggregate({
      where: { bookingId: id },
      _sum: { amount: true },
    });
    expect(paid._sum.amount).toBeLessThanOrEqual(totalPrice);
  });

  it("accepts payment only for a visit that took place", async () => {
    const time = await freeTime(ownMasterId);
    const { id } = await createStaffBooking(
      db,
      owner,
      input({ time }),
      TEST_NOW,
    );
    expect(
      await errorOf(
        addPayment(db, owner, id, { amount: 100, method: "CASH" }, TEST_NOW),
      ),
    ).toMatch(/Оплату вносят за состоявшийся визит/);
  });

  it("keeps the total above what is already paid", async () => {
    const { id } = await startedBooking();
    await changeBookingStatus(
      db,
      owner,
      id,
      { to: "COMPLETED", payment: { amount: 1000, method: "CASH" } },
      TEST_NOW,
    );
    const booking = await db.booking.findUniqueOrThrow({
      where: { id },
      include: { items: true },
    });
    const item = booking.items[0];
    if (!item) throw new Error("No items");
    expect(
      await errorOf(
        updateStaffBooking(
          db,
          owner,
          id,
          await versionOf(id),
          {
            masterId: booking.masterId,
            date: today,
            time: "00:00",
            durationMin: null,
            discount: { mode: "none", kind: "PERCENT", value: null },
            prices: { [item.id]: 500 },
          },
          TEST_NOW,
        ),
      ),
    ).toMatch(/уже оплачено 1\s000\s₽/);
  });
});

describe("deleteBooking", () => {
  it("hides the booking and frees its time; a master cannot delete", async () => {
    const time = await freeTime(ownMasterId);
    const { id } = await createStaffBooking(
      db,
      owner,
      input({ time }),
      TEST_NOW,
    );
    expect(await free(ownMasterId, tomorrow)).not.toContain(time);
    expect(await errorOf(deleteBooking(db, master, id, TEST_NOW))).toBe(
      "forbidden",
    );

    await deleteBooking(db, admin, id, TEST_NOW);
    expect(await free(ownMasterId, tomorrow)).toContain(time);
    const list = await listBookings(
      db,
      owner,
      { period: "all", status: null, masterId: null, query: "", page: 1 },
      TEST_NOW,
    );
    expect(list.rows.map((row) => row.id)).not.toContain(id);
    // Время снова свободно — на него можно записать.
    await createStaffBooking(db, owner, input({ time }), TEST_NOW);
  });
});

describe("concurrent edits (Codex review)", () => {
  const keep = (time: string, masterId = ownMasterId, date = tomorrow) => ({
    masterId,
    date,
    time,
    durationMin: null,
    discount: { mode: "none" as const, kind: "PERCENT" as const, value: null },
    prices: {},
  });

  it("refuses to save a form opened before someone else's change", async () => {
    const time = await freeTime(ownMasterId);
    const { id } = await createStaffBooking(
      db,
      owner,
      input({ time }),
      TEST_NOW,
    );
    const opened = await versionOf(id);
    await updateStaffBooking(db, admin, id, opened, keep("21:00"), TEST_NOW);
    // Второй админ сохраняет форму, открытую до переноса, — время 21:00 не затирается.
    expect(
      await errorOf(
        updateStaffBooking(db, owner, id, opened, keep(time), TEST_NOW),
      ),
    ).toBe(BOOKING_CHANGED);
    const booking = await db.booking.findUniqueOrThrow({ where: { id } });
    expect(formatSalonTime(booking.startsAt)).toBe("21:00");
  });

  it("never leaves payments above the total when a payment races a price cut", async () => {
    const { id } = await startedBooking();
    await changeBookingStatus(
      db,
      owner,
      id,
      { to: "COMPLETED", payment: null },
      TEST_NOW,
    );
    const booking = await db.booking.findUniqueOrThrow({
      where: { id },
      include: { items: true },
    });
    const item = booking.items[0];
    if (!item) throw new Error("No items");
    const cheaper = {
      ...keep("08:00", booking.masterId, today),
      prices: { [item.id]: 100 },
    };
    await Promise.all([
      errorOf(
        addPayment(
          db,
          owner,
          id,
          { amount: booking.totalPrice / 100, method: "CASH" },
          TEST_NOW,
        ),
      ),
      errorOf(
        updateStaffBooking(db, owner, id, booking.updatedAt, cheaper, TEST_NOW),
      ),
    ]);
    const after = await db.booking.findUniqueOrThrow({ where: { id } });
    const paid = await db.payment.aggregate({
      where: { bookingId: id },
      _sum: { amount: true },
    });
    expect(paid._sum.amount ?? 0).toBeLessThanOrEqual(after.totalPrice);
  });

  it("does not let a master change a booking moved to another master meanwhile", async () => {
    const time = await freeTime(ownMasterId);
    const { id } = await createStaffBooking(
      db,
      owner,
      input({ time }),
      TEST_NOW,
    );
    const otherTime = await freeTime(otherMasterId);
    await Promise.all([
      errorOf(
        updateStaffBooking(
          db,
          admin,
          id,
          await versionOf(id),
          keep(otherTime, otherMasterId),
          TEST_NOW,
        ),
      ),
      errorOf(
        changeBookingStatus(
          db,
          master,
          id,
          { to: "CANCELLED", payment: null },
          TEST_NOW,
        ),
      ),
    ]);
    const booking = await db.booking.findUniqueOrThrow({ where: { id } });
    // Либо отмена прошла до переноса (запись ещё была его), либо перенос — и тогда
    // мастер чужую запись уже не трогает.
    expect(
      booking.masterId === otherMasterId && booking.status === "CANCELLED",
    ).toBe(false);
  });

  it("shows a visit after midnight on the next day too", async () => {
    const { id } = await createStaffBooking(
      db,
      owner,
      input({ time: "23:30", durationMin: 90 }),
      TEST_NOW,
    );
    const nextDay = addDays(tomorrow, 1);
    const board = await loadDayBoard(db, owner, nextDay);
    const block = board.columns
      .find((column) => column.master.id === ownMasterId)
      ?.bookings.find((booking) => booking.id === id);
    expect(block).toMatchObject({
      startMin: 0,
      endMin: 60,
      start: "23:30",
      end: "01:00",
    });
    const evening = (await loadDayBoard(db, owner, tomorrow)).columns
      .find((column) => column.master.id === ownMasterId)
      ?.bookings.find((booking) => booking.id === id);
    expect(evening).toMatchObject({ startMin: 23 * 60 + 30, endMin: 24 * 60 });
  });
});

describe("CRM queries", () => {
  it("shows a master only their own column and bookings", async () => {
    const board = await loadDayBoard(db, master, today);
    expect(board.columns.map((column) => column.master.id)).toEqual([
      ownMasterId,
    ]);
    const list = await listBookings(
      db,
      master,
      {
        period: "all",
        status: null,
        masterId: otherMasterId,
        query: "",
        page: 1,
      },
      TEST_NOW,
    );
    expect(list.total).toBe(0);
  });

  it("shows day revenue to the owner and the master, but not to the admin", async () => {
    expect((await loadTodayStats(db, owner, TEST_NOW)).revenue).not.toBeNull();
    expect((await loadTodayStats(db, master, TEST_NOW)).revenue).not.toBeNull();
    expect((await loadTodayStats(db, admin, TEST_NOW)).revenue).toBeNull();
  });

  it("finds bookings by client name and phone digits", async () => {
    const time = await freeTime(ownMasterId);
    const phone = nextPhone();
    await createStaffBooking(
      db,
      owner,
      input({ time, phone, name: "Уникальный Искомый" }),
      TEST_NOW,
    );
    const filters = {
      period: "all" as const,
      status: null,
      masterId: null,
      page: 1,
    };
    const byName = await listBookings(
      db,
      owner,
      { ...filters, query: "искомый" },
      TEST_NOW,
    );
    expect(byName.rows.map((row) => row.client.name)).toEqual([
      "Уникальный Искомый",
    ]);
    const byPhone = await listBookings(
      db,
      owner,
      { ...filters, query: phone.slice(-7) },
      TEST_NOW,
    );
    expect(byPhone.rows.map((row) => row.client.name)).toContain(
      "Уникальный Искомый",
    );
  });
});
