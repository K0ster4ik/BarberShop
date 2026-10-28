import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  addDays,
  addMinutes,
  minutesToTime,
  toSalonDate,
  toSalonMinutes,
} from "@/lib/time";
import {
  ANY_MASTER,
  type CreateBookingInput,
  createBookingSchema,
} from "@/lib/validation/booking";
import { loadAvailability } from "@/server/bookings/availability";
import {
  BOOKING_NOT_FOUND,
  cancelBookingByToken,
  loadBookingByToken,
} from "@/server/bookings/cancel";
import {
  ACTIVE_BOOKING_EXISTS,
  createWebsiteBooking,
  PROMO_CODE_RAN_OUT,
} from "@/server/bookings/create";
import { loadOffers } from "@/server/bookings/offer";
import { quoteBooking, SLOT_TAKEN } from "@/server/bookings/quote";
import { DomainError } from "@/server/errors";
import { deliverNotifications } from "@/server/notifications/outbox";
import { seedDemo, TEST_NOW } from "./fixtures";
import { createTestDb } from "./test-db";

// Запись с сайта и отмена по ссылке на настоящей БД (DESIGN.md, 7.2, 7.5, 9).

let db: PrismaClient;
let haircutId: string;
const tomorrow = addDays(toSalonDate(TEST_NOW), 1);

beforeAll(() => {
  db = createTestDb();
});
afterAll(async () => {
  await db.$disconnect();
});
beforeEach(async () => {
  await seedDemo(db);
  haircutId = (
    await db.service.findFirstOrThrow({ where: { name: "Мужская стрижка" } })
  ).id;
});

/** Свободные времена на завтра: [время, мастера от наименее загруженного]. */
async function freeTimes(masterId: string = ANY_MASTER) {
  const offers = (await loadOffers(db, [haircutId])).filter(
    (offer) => masterId === ANY_MASTER || offer.master.id === masterId,
  );
  const slots = (await loadAvailability(db, offers, [tomorrow], TEST_NOW)).get(
    tomorrow,
  );
  return (slots ?? []).map((slot) => ({
    time: minutesToTime(toSalonMinutes(slot.start)),
    masterIds: slot.masterIds,
  }));
}

let phoneSeq = 0;
/** Новый номер на каждый вызов: +7 900 000-00-01, +7 900 000-00-02… */
function nextPhone() {
  phoneSeq += 1;
  return `+7 900 ${String(phoneSeq).padStart(7, "0")}`;
}

async function bookingInput(
  overrides: Partial<CreateBookingInput> & { time: string; masterId: string },
): Promise<CreateBookingInput> {
  const base = {
    serviceIds: [haircutId],
    date: tomorrow,
    name: "Тест Клиентов",
    country: "RU",
    phone: nextPhone(),
    comment: "",
    promoCode: "",
    consent: true,
    website: "",
    ...overrides,
  };
  const quote = await quoteBooking(
    db,
    base,
    {
      phone: base.phone.replace(/[^\d+]/g, ""),
      promoCode: base.promoCode,
    },
    TEST_NOW,
  );
  return createBookingSchema.parse({
    ...base,
    expectedTotal: overrides.expectedTotal ?? quote.pricing.totalPrice,
  });
}

async function outcome(promise: Promise<unknown>) {
  return promise.then(
    (value) => value,
    (error: unknown) =>
      error instanceof DomainError
        ? { error: error.message }
        : Promise.reject(error),
  );
}

describe("createWebsiteBooking", () => {
  it("books a free slot as PENDING with a price snapshot and a notification", async () => {
    const [free] = await freeTimes();
    if (!free) throw new Error("No free time tomorrow");
    const masterId = free.masterIds[0] ?? "";
    const input = await bookingInput({ time: free.time, masterId });

    const result = await createWebsiteBooking(db, input, TEST_NOW);
    if (result.status !== "created") throw new Error(result.status);

    const booking = await db.booking.findUniqueOrThrow({
      where: { id: result.bookingId },
      include: { items: true, notifications: true, client: true },
    });
    expect(booking).toMatchObject({
      status: "PENDING",
      source: "WEBSITE",
      masterId,
      totalPrice: input.expectedTotal,
      createdById: null,
    });
    expect(booking.endsAt).toEqual(
      addMinutes(booking.startsAt, booking.durationMin),
    );
    expect(booking.items).toHaveLength(1);
    expect(booking.items[0]?.serviceName).toBe("Мужская стрижка");
    expect(booking.notifications.map((n) => n.type)).toEqual([
      "BOOKING_CREATED",
    ]);
    expect(booking.client.phone).toMatch(/^\+7900\d{7}$/);
    // В БД — только хэш токена; по самому токену запись находится
    expect(booking.cancelTokenHash).not.toBe(result.token);
    expect((await loadBookingByToken(db, result.token))?.id).toBe(booking.id);
  });

  it("allows one active website booking per phone", async () => {
    const times = await freeTimes();
    const phone = nextPhone();
    const [first, second] = [times[0], times.at(-1)];
    if (!first || !second || first === second) throw new Error("No slots");

    await createWebsiteBooking(
      db,
      await bookingInput({
        time: first.time,
        masterId: ANY_MASTER,
        phone,
      }),
      TEST_NOW,
    );
    await expect(
      outcome(
        createWebsiteBooking(
          db,
          await bookingInput({
            time: second.time,
            masterId: ANY_MASTER,
            phone,
          }),
          TEST_NOW,
        ),
      ),
    ).resolves.toEqual({ error: ACTIVE_BOOKING_EXISTS });
  });

  it("lets only one of two parallel requests take the same phone", async () => {
    const times = await freeTimes();
    const phone = nextPhone();
    const [first, second] = [times[0], times.at(-1)];
    if (!first || !second || first === second) throw new Error("No slots");
    const inputs = await Promise.all([
      bookingInput({ time: first.time, masterId: ANY_MASTER, phone }),
      bookingInput({ time: second.time, masterId: ANY_MASTER, phone }),
    ]);

    const results = await Promise.all(
      inputs.map((input) => outcome(createWebsiteBooking(db, input, TEST_NOW))),
    );
    expect(results.filter((r) => "status" in (r as object))).toHaveLength(1);
    expect(results).toContainEqual({ error: ACTIVE_BOOKING_EXISTS });
  });

  it("gives a slot of a specific master to only one of two clients", async () => {
    const [free] = await freeTimes();
    const masterId = free?.masterIds[0];
    if (!free || !masterId) throw new Error("No slots");
    const inputs = await Promise.all([
      bookingInput({ time: free.time, masterId }),
      bookingInput({ time: free.time, masterId }),
    ]);

    const results = await Promise.all(
      inputs.map((input) => outcome(createWebsiteBooking(db, input, TEST_NOW))),
    );
    expect(
      results.filter((r) => (r as { status?: string }).status === "created"),
    ).toHaveLength(1);
    expect(results).toContainEqual({ error: SLOT_TAKEN });
  });

  it("hands «any master» to the next free master when the first is taken", async () => {
    const shared = (await freeTimes()).find(
      (slot) => slot.masterIds.length > 1,
    );
    if (!shared) throw new Error("No time with two free masters");
    const [first, second] = shared.masterIds;

    await createWebsiteBooking(
      db,
      await bookingInput({ time: shared.time, masterId: first ?? "" }),
      TEST_NOW,
    );
    // Теперь «любой мастер» в это же время — второй, и клиент видит его цену
    const input = await bookingInput({
      time: shared.time,
      masterId: ANY_MASTER,
    });
    const result = await createWebsiteBooking(db, input, TEST_NOW);
    if (result.status !== "created") throw new Error(result.status);
    const booking = await db.booking.findUniqueOrThrow({
      where: { id: result.bookingId },
    });
    expect(booking.masterId).toBe(second);
  });

  it("never fails «any master» while another master is still free", async () => {
    const shared = (await freeTimes()).find(
      (slot) => slot.masterIds.length > 1,
    );
    if (!shared) throw new Error("No time with two free masters");
    const inputs = await Promise.all([
      bookingInput({ time: shared.time, masterId: ANY_MASTER }),
      bookingInput({ time: shared.time, masterId: ANY_MASTER }),
    ]);
    const results = await Promise.all(
      inputs.map((input) => outcome(createWebsiteBooking(db, input, TEST_NOW))),
    );
    // Второй получает следующего мастера либо его цену на подтверждение — но не отказ
    expect(results).not.toContainEqual({ error: SLOT_TAKEN });
    expect(results.map((r) => (r as { status: string }).status)).toContain(
      "created",
    );
  });

  it("does not book at a price the client has not seen", async () => {
    const [free] = await freeTimes();
    if (!free) throw new Error("No slots");
    const input = await bookingInput({
      time: free.time,
      masterId: ANY_MASTER,
      expectedTotal: 1,
    });
    const before = await db.booking.count();
    const result = await createWebsiteBooking(db, input, TEST_NOW);
    expect(result.status).toBe("price_changed");
    expect(await db.booking.count()).toBe(before);
  });

  it("stops a promo code at its limit even under parallel requests", async () => {
    const times = await freeTimes();
    const code = await db.promoCode.create({
      data: { code: "LASTONE", kind: "PERCENT", value: 10, maxUses: 1 },
    });
    const [first, second] = [times[0], times.at(-1)];
    if (!first || !second || first === second) throw new Error("No slots");
    const inputs = await Promise.all([
      bookingInput({
        time: first.time,
        masterId: ANY_MASTER,
        promoCode: "lastone",
      }),
      bookingInput({
        time: second.time,
        masterId: ANY_MASTER,
        promoCode: "LASTONE",
      }),
    ]);

    const results = await Promise.all(
      inputs.map((input) => outcome(createWebsiteBooking(db, input, TEST_NOW))),
    );
    expect(results).toContainEqual({ error: PROMO_CODE_RAN_OUT });
    expect(await db.booking.count({ where: { promoCodeId: code.id } })).toBe(1);
  });
});

describe("cancelBookingByToken", () => {
  async function bookTomorrow() {
    const [free] = await freeTimes();
    if (!free) throw new Error("No slots");
    const result = await createWebsiteBooking(
      db,
      await bookingInput({ time: free.time, masterId: ANY_MASTER }),
      TEST_NOW,
    );
    if (result.status !== "created") throw new Error(result.status);
    return result;
  }

  it("cancels once and queues a notification", async () => {
    const { token, bookingId } = await bookTomorrow();
    await cancelBookingByToken(db, token, TEST_NOW);

    const booking = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { notifications: { orderBy: { createdAt: "asc" } } },
    });
    expect(booking).toMatchObject({
      status: "CANCELLED",
      cancelledBy: "CLIENT",
    });
    expect(booking.notifications.map((n) => n.type)).toEqual([
      "BOOKING_CREATED",
      "BOOKING_CANCELLED",
    ]);
    await expect(
      outcome(cancelBookingByToken(db, token, TEST_NOW)),
    ).resolves.toEqual({ error: "Запись уже отменена." });
  });

  it("refuses close to the start and for unknown links", async () => {
    const { token, bookingId } = await bookTomorrow();
    const { startsAt } = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    const late = await outcome(
      cancelBookingByToken(db, token, addMinutes(startsAt, -60)),
    );
    expect(late).toMatchObject({ error: expect.stringContaining("за 2 ч") });
    await expect(
      outcome(cancelBookingByToken(db, "x".repeat(43), TEST_NOW)),
    ).resolves.toEqual({ error: BOOKING_NOT_FOUND });
  });
});

describe("deliverNotifications", () => {
  async function queued() {
    const [free] = await freeTimes();
    if (!free) throw new Error("No slots");
    await createWebsiteBooking(
      db,
      await bookingInput({ time: free.time, masterId: ANY_MASTER }),
      TEST_NOW,
    );
    return db.notification.findFirstOrThrow({ where: { sentAt: null } });
  }

  it("marks a sent message and keeps a failed one for retry", async () => {
    const notification = await queued();
    const failing = await deliverNotifications(db, async () => {
      throw new Error("Telegram ответил 429: Too Many Requests");
    });
    expect(failing).toEqual({ sent: 0, failed: 1 });
    expect(
      await db.notification.findUniqueOrThrow({
        where: { id: notification.id },
      }),
    ).toMatchObject({
      sentAt: null,
      attempts: 1,
      lastError: expect.stringContaining("429"),
    });

    const texts: string[] = [];
    await deliverNotifications(db, async (text) => {
      texts.push(text);
    });
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain("Новая запись");
    expect(texts[0]).toMatch(/\+7 900 \*\*\* \*\* \d{2}/);
    expect(
      await db.notification.findUniqueOrThrow({
        where: { id: notification.id },
      }),
    ).toMatchObject({ attempts: 2, lastError: null, sentAt: expect.any(Date) });
  });

  it("sends each message once when two deliveries run at the same time", async () => {
    await queued();
    let calls = 0;
    const slowSend = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 200));
    };
    await Promise.all([
      deliverNotifications(db, slowSend),
      deliverNotifications(db, slowSend),
    ]);
    expect(calls).toBe(1);
  });
});
