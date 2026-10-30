import { describe, expect, it } from "vitest";
import { type ClientVisit, clientStats } from "@/server/clients/stats";

const NOW = new Date("2026-11-03T12:00:00Z");
const artem = { id: "artem", name: "Артём" };
const dmitry = { id: "dmitry", name: "Дмитрий" };

function visit(overrides: Partial<ClientVisit>): ClientVisit {
  return {
    status: "COMPLETED",
    startsAt: new Date("2026-10-01T10:00:00Z"),
    master: artem,
    amount: 200_000,
    ...overrides,
  };
}

describe("clientStats", () => {
  it("counts only completed visits into the total and the average check", () => {
    const stats = clientStats(
      [
        visit({ amount: 180_000 }),
        visit({ amount: 250_000, startsAt: new Date("2026-10-20T10:00:00Z") }),
        visit({ status: "CANCELLED", amount: 900_000 }),
        visit({ status: "NO_SHOW", amount: 900_000 }),
      ],
      NOW,
    );
    expect(stats).toMatchObject({
      visits: 2,
      total: 430_000,
      averageCheck: 215_000,
      lastVisitAt: new Date("2026-10-20T10:00:00Z"),
    });
  });

  it("rates no-shows against visits that were due, not against cancellations", () => {
    const stats = clientStats(
      [
        visit({}),
        visit({}),
        visit({}),
        visit({ status: "NO_SHOW" }),
        visit({ status: "CANCELLED" }),
      ],
      NOW,
    );
    expect(stats.noShowRate).toBe(0.25);
  });

  it("picks the master with most visits, the latest one on a tie", () => {
    const stats = clientStats(
      [
        visit({ master: artem, startsAt: new Date("2026-09-01T10:00:00Z") }),
        visit({ master: dmitry, startsAt: new Date("2026-10-01T10:00:00Z") }),
      ],
      NOW,
    );
    expect(stats.favoriteMaster).toEqual(dmitry);
    expect(
      clientStats(
        [
          visit({ master: artem }),
          visit({ master: artem }),
          visit({ master: dmitry }),
        ],
        NOW,
      ).favoriteMaster,
    ).toEqual(artem);
  });

  it("returns empty figures for a client without visits and counts upcoming bookings", () => {
    const stats = clientStats(
      [
        visit({
          status: "PENDING",
          startsAt: new Date("2026-11-05T10:00:00Z"),
        }),
        visit({
          status: "CONFIRMED",
          startsAt: new Date("2026-11-06T10:00:00Z"),
        }),
        visit({
          status: "CONFIRMED",
          startsAt: new Date("2026-11-01T10:00:00Z"),
        }),
      ],
      NOW,
    );
    expect(stats).toEqual({
      visits: 0,
      total: 0,
      averageCheck: null,
      lastVisitAt: null,
      favoriteMaster: null,
      noShowRate: null,
      upcoming: 2,
    });
  });
});
