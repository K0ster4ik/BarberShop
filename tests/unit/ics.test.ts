import { describe, expect, it } from "vitest";
import { buildBookingIcs } from "@/server/bookings/ics";

const event = {
  bookingId: "cbooking0000000000000001",
  status: "CONFIRMED" as const,
  startsAt: new Date("2026-11-04T11:15:00Z"),
  endsAt: new Date("2026-11-04T12:45:00Z"),
  services: ["Мужская стрижка", "Оформление бороды"],
  masterName: "Дмитрий Волков",
  totalPrice: 280_000,
  url: "https://barbershop.example/booking/abc",
  now: new Date("2026-10-28T09:00:00Z"),
};

describe("buildBookingIcs", () => {
  it("builds a calendar event in UTC with CRLF line endings", () => {
    const ics = buildBookingIcs(event);
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("DTSTART:20261104T111500Z");
    expect(lines).toContain("DTEND:20261104T124500Z");
    expect(lines).toContain("DTSTAMP:20261028T090000Z");
    expect(lines).toContain("UID:cbooking0000000000000001@barbershop-demo");
    expect(lines).toContain("STATUS:CONFIRMED");
    expect(lines).toContain("URL:https://barbershop.example/booking/abc");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("folds long lines at 75 bytes without splitting a letter", () => {
    const ics = buildBookingIcs({
      ...event,
      services: Array.from({ length: 6 }, () => "Камуфляж седины"),
    });
    for (const line of ics.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    // Склеенный обратно текст — исходный, без битых символов
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(
      `SUMMARY:Барбершоп: ${Array(6).fill("Камуфляж седины").join("\\, ")}`,
    );
  });

  it("escapes commas, semicolons and line breaks in text", () => {
    const ics = buildBookingIcs({ ...event, masterName: "Иван; Петров, мл." });
    expect(ics.replace(/\r\n /g, "")).toContain("Иван\\; Петров\\, мл.");
  });

  it("marks a cancelled booking so calendars drop the event", () => {
    expect(buildBookingIcs({ ...event, status: "CANCELLED" })).toContain(
      "STATUS:CANCELLED",
    );
  });
});
