import { describe, expect, it } from "vitest";
import { salon } from "@/config/salon";
import { toSalonDate, toSalonMinutes, weekdayOf } from "@/lib/time";
import { generateDemoData } from "@/server/demo/generate";

// Вторник, 14:30 по Москве.
const now = new Date("2026-11-03T11:30:00Z");
const data = generateDemoData({ now });

const ACTIVE = new Set(["PENDING", "CONFIRMED", "COMPLETED"]);
const activeBookings = data.bookings.filter((b) => ACTIVE.has(b.status));

describe("generateDemoData", () => {
  it("produces a busy but realistic salon", () => {
    expect(data.clients).toHaveLength(400);
    expect(data.bookings.length).toBeGreaterThan(1000);
    expect(data.bookings.some((b) => b.startsAt > now)).toBe(true);
    expect(
      data.bookings.some((b) => toSalonDate(b.startsAt) === toSalonDate(now)),
    ).toBe(true);
  });

  it("is deterministic", () => {
    expect(generateDemoData({ now })).toEqual(data);
  });

  it("keeps the same layout when only the time of day changes", () => {
    const evening = generateDemoData({ now: new Date("2026-11-03T17:00:00Z") });
    const layout = (d: typeof data) =>
      d.bookings.map((b) => [
        b.id,
        b.masterId,
        b.clientId,
        b.startsAt.getTime(),
      ]);
    expect(layout(evening)).toEqual(layout(data));
  });

  it("never overlaps active bookings of one master, buffer included", () => {
    const byMaster = Map.groupBy(activeBookings, (b) => b.masterId);
    for (const bookings of byMaster.values()) {
      const sorted = bookings.toSorted(
        (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
      );
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.startsAt >= sorted[i - 1]!.blockedUntil).toBe(true);
      }
    }
  });

  it("places bookings inside working hours and outside time off", () => {
    for (const booking of data.bookings) {
      const weekday = weekdayOf(toSalonDate(booking.startsAt));
      const start = toSalonMinutes(booking.startsAt);
      const end = start + booking.durationMin;
      const shifts = data.workingHours.filter(
        (wh) => wh.masterId === booking.masterId && wh.weekday === weekday,
      );
      expect(
        shifts.some((wh) => wh.startMin <= start && end <= wh.endMin),
      ).toBe(true);

      const clashesWithTimeOff = data.timeOffs.some(
        (off) =>
          off.masterId === booking.masterId &&
          off.startsAt < booking.blockedUntil &&
          booking.startsAt < off.endsAt,
      );
      expect(clashesWithTimeOff).toBe(false);
    }
  });

  it("starts bookings on the slot grid", () => {
    for (const booking of data.bookings) {
      expect(toSalonMinutes(booking.startsAt) % salon.slotStepMin).toBe(0);
    }
  });

  it("keeps prices, discounts and durations consistent", () => {
    const itemsByBooking = Map.groupBy(
      data.bookingItems,
      (item) => item.bookingId,
    );
    for (const booking of data.bookings) {
      const items = itemsByBooking.get(booking.id) ?? [];
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.price).toBe(item.basePrice - item.masterDiscount);
      }
      expect(booking.subtotal).toBe(
        items.reduce((sum, item) => sum + item.price, 0),
      );
      expect(booking.totalPrice).toBe(booking.subtotal - booking.salonDiscount);
      expect(booking.totalPrice).toBeGreaterThanOrEqual(0);
      expect(booking.durationMin).toBe(
        items.reduce((sum, item) => sum + item.durationMin, 0),
      );
      expect(booking.endsAt.getTime() - booking.startsAt.getTime()).toBe(
        booking.durationMin * 60_000,
      );
      expect(booking.blockedUntil.getTime() - booking.endsAt.getTime()).toBe(
        booking.bufferMin * 60_000,
      );
    }
  });

  it("uses statuses that match the moment of reset", () => {
    for (const booking of data.bookings) {
      if (booking.endsAt <= now) {
        expect(["COMPLETED", "NO_SHOW", "CANCELLED"]).toContain(booking.status);
      } else if (booking.startsAt > now) {
        expect(["PENDING", "CONFIRMED", "CANCELLED"]).toContain(booking.status);
      }
      expect(booking.createdAt <= now).toBe(true);
      expect(booking.createdAt < booking.startsAt).toBe(true);
      expect(booking.status === "CANCELLED").toBe(booking.cancelledAt !== null);
    }
  });

  it("gives each client at most one upcoming active booking", () => {
    const upcoming = activeBookings.filter((b) => b.startsAt > now);
    const clients = upcoming.map((b) => b.clientId);
    expect(new Set(clients).size).toBe(clients.length);
  });

  it("has about 8% no-shows", () => {
    const visits = data.bookings.filter(
      (b) => b.status === "COMPLETED" || b.status === "NO_SHOW",
    );
    const noShows = visits.filter((b) => b.status === "NO_SHOW").length;
    expect(noShows / visits.length).toBeGreaterThan(0.05);
    expect(noShows / visits.length).toBeLessThan(0.11);
  });

  it("records payments only for completed visits and never overpays", () => {
    const paymentsByBooking = Map.groupBy(data.payments, (p) => p.bookingId);
    for (const booking of data.bookings) {
      const paid = (paymentsByBooking.get(booking.id) ?? []).reduce(
        (sum, p) => sum + p.amount,
        0,
      );
      if (booking.status !== "COMPLETED") expect(paid).toBe(0);
      expect(paid).toBeLessThanOrEqual(booking.totalPrice);
    }
  });

  it("uses unique E.164 phone numbers", () => {
    const phones = data.clients.map((c) => c.phone);
    expect(new Set(phones).size).toBe(phones.length);
    for (const phone of phones) expect(phone).toMatch(/^\+79\d{9}$/);
  });
});
