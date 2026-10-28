import { describe, expect, it } from "vitest";
import { isDue } from "@/server/notifications/outbox";

const createdAt = new Date("2026-11-03T12:00:00Z");
const at = (minutes: number) =>
  new Date(createdAt.getTime() + minutes * 60_000);

describe("isDue", () => {
  it("sends a new notification at once", () => {
    expect(isDue({ attempts: 0, createdAt }, createdAt)).toBe(true);
  });

  it("backs off after failures: 5, 15, 35 minutes after creation…", () => {
    expect(isDue({ attempts: 1, createdAt }, at(4))).toBe(false);
    expect(isDue({ attempts: 1, createdAt }, at(5))).toBe(true);
    expect(isDue({ attempts: 2, createdAt }, at(14))).toBe(false);
    expect(isDue({ attempts: 2, createdAt }, at(15))).toBe(true);
    expect(isDue({ attempts: 3, createdAt }, at(35))).toBe(true);
    // Десятая попытка — примерно через двое суток, а не через 50 минут
    expect(isDue({ attempts: 9, createdAt }, at(2_000))).toBe(false);
    expect(isDue({ attempts: 9, createdAt }, at(2_555))).toBe(true);
  });
});
