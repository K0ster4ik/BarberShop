import type { BookingStatus } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/money";

// Файл .ics «Добавить в календарь» (DESIGN.md, 7.1) по RFC 5545: строки через CRLF,
// длинные строки переносятся по 75 байт, время — в UTC.

export type BookingIcsEvent = {
  bookingId: string;
  status: BookingStatus;
  startsAt: Date;
  endsAt: Date;
  services: string[];
  masterName: string;
  totalPrice: number;
  url: string; // страница записи: посмотреть или отменить
  now: Date;
};

const STATUS: Record<BookingStatus, string> = {
  PENDING: "TENTATIVE",
  CONFIRMED: "CONFIRMED",
  COMPLETED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "CANCELLED",
};

export function buildBookingIcs(event: BookingIcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Barbershop demo//Online booking//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.bookingId}@barbershop-demo`,
    `DTSTAMP:${utc(event.now)}`,
    `DTSTART:${utc(event.startsAt)}`,
    `DTEND:${utc(event.endsAt)}`,
    `SUMMARY:${text(`Барбершоп: ${event.services.join(", ")}`)}`,
    `DESCRIPTION:${text(
      [
        `Мастер: ${event.masterName}`,
        `Итого: ${formatMoney(event.totalPrice)}`,
        `Посмотреть или отменить запись: ${event.url}`,
      ].join("\n"),
    )}`,
    `URL:${event.url}`,
    `STATUS:${STATUS[event.status]}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** 2026-11-04T11:15:00.000Z → 20261104T111500Z */
function utc(instant: Date): string {
  return instant
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function text(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}

/** Перенос по 75 байт UTF-8; продолжение начинается с пробела. Буква не разрывается. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    const limit = parts.length === 0 ? 75 : 74; // у продолжения 1 байт — пробел
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}
