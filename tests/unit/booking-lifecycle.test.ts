import { describe, expect, it } from "vitest";
import { nextStatuses, statusChangeIssue } from "@/server/bookings/lifecycle";

const START = new Date("2026-11-03T12:00:00Z");
const BEFORE = new Date("2026-11-03T11:59:00Z");
const AFTER = new Date("2026-11-03T12:00:00Z");

describe("nextStatuses", () => {
  it("lets a pending booking be confirmed or cancelled before the visit", () => {
    expect(
      nextStatuses({ status: "PENDING", startsAt: START }, "MASTER", BEFORE),
    ).toEqual(["CONFIRMED", "CANCELLED"]);
  });

  it("allows marking the visit only once it has started", () => {
    expect(
      nextStatuses({ status: "CONFIRMED", startsAt: START }, "ADMIN", BEFORE),
    ).toEqual(["CANCELLED"]);
    expect(
      nextStatuses({ status: "CONFIRMED", startsAt: START }, "ADMIN", AFTER),
    ).toEqual(["COMPLETED", "NO_SHOW", "CANCELLED"]);
    // Мастер забыл подтвердить, а клиент пришёл.
    expect(
      nextStatuses({ status: "PENDING", startsAt: START }, "MASTER", AFTER),
    ).toEqual(["CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED"]);
  });

  it("keeps final statuses final, except a manager fixing came ↔ did not come", () => {
    const completed = { status: "COMPLETED" as const, startsAt: START };
    const noShow = { status: "NO_SHOW" as const, startsAt: START };
    expect(nextStatuses(completed, "OWNER", AFTER)).toEqual(["NO_SHOW"]);
    expect(nextStatuses(noShow, "ADMIN", AFTER)).toEqual(["COMPLETED"]);
    expect(nextStatuses(completed, "MASTER", AFTER)).toEqual([]);
    expect(nextStatuses(noShow, "MASTER", AFTER)).toEqual([]);
    expect(
      nextStatuses({ status: "CANCELLED", startsAt: START }, "OWNER", AFTER),
    ).toEqual([]);
  });
});

describe("statusChangeIssue", () => {
  it("explains why a change is not allowed", () => {
    const confirmed = { status: "CONFIRMED" as const, startsAt: START };
    expect(
      statusChangeIssue(confirmed, "CANCELLED", "MASTER", BEFORE),
    ).toBeNull();
    expect(statusChangeIssue(confirmed, "COMPLETED", "ADMIN", BEFORE)).toBe(
      "Отметить визит можно только после его начала.",
    );
    expect(statusChangeIssue(confirmed, "CONFIRMED", "ADMIN", BEFORE)).toBe(
      "Запись уже в этом статусе.",
    );
    expect(
      statusChangeIssue(
        { status: "CANCELLED", startsAt: START },
        "CONFIRMED",
        "OWNER",
        BEFORE,
      ),
    ).toBe("Запись отменена — её статус больше не меняется.");
    expect(
      statusChangeIssue(
        { status: "COMPLETED", startsAt: START },
        "NO_SHOW",
        "MASTER",
        AFTER,
      ),
    ).toBe("Исправить отметку о визите может администратор.");
    expect(
      statusChangeIssue(
        { status: "NO_SHOW", startsAt: START },
        "CANCELLED",
        "ADMIN",
        AFTER,
      ),
    ).toBe("Визит уже отмечен — статус больше не меняется.");
  });
});
