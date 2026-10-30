import { describe, expect, it } from "vitest";
import { salonTimeToInstant } from "@/lib/time";
import { fitsSchedule } from "@/server/slots/fit";

const DATE = "2026-11-03";
const at = (minutes: number) => salonTimeToInstant(DATE, minutes);

function fits(
  startMin: number,
  durationMin: number,
  extra: Partial<Parameters<typeof fitsSchedule>[0]> = {},
) {
  return fitsSchedule({
    date: DATE,
    start: at(startMin),
    durationMin,
    workingHours: [
      { startMin: 600, endMin: 780 }, // 10:00–13:00
      { startMin: 840, endMin: 1200 }, // 14:00–20:00
    ],
    timeOffs: [],
    ...extra,
  });
}

describe("fitsSchedule", () => {
  it("accepts a visit inside a shift, edges included", () => {
    expect(fits(600, 60)).toBe(true);
    expect(fits(1140, 60)).toBe(true);
  });

  it("rejects a visit that crosses a break or the end of the day", () => {
    expect(fits(750, 60)).toBe(false); // 12:30–13:30, обед с 13:00
    expect(fits(1170, 60)).toBe(false);
    expect(fits(540, 60)).toBe(false);
  });

  it("treats touching intervals as one shift", () => {
    expect(
      fits(690, 60, {
        workingHours: [
          { startMin: 600, endMin: 720 },
          { startMin: 720, endMin: 840 },
        ],
      }),
    ).toBe(true);
  });

  it("rejects a visit that overlaps a time off and a day without a schedule", () => {
    expect(
      fits(900, 60, { timeOffs: [{ start: at(930), end: at(960) }] }),
    ).toBe(false);
    expect(
      fits(900, 30, { timeOffs: [{ start: at(930), end: at(960) }] }),
    ).toBe(true);
    expect(fits(900, 30, { workingHours: [] })).toBe(false);
  });
});
