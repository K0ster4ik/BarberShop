import { describe, expect, it } from "vitest";
import {
  formatNotification,
  type NotificationBooking,
} from "@/server/notifications/format";

// Intl ставит неразрывные пробелы в суммах — сравниваем текст, а не их вид.
const plain = (text: string) => text.replace(/[\u00A0\u202F]/g, " ");

const booking: NotificationBooking = {
  clientName: "Иван Петров",
  clientPhone: "+79991234567",
  masterName: "Дмитрий Волков",
  startsAt: new Date("2026-11-04T11:15:00Z"), // 14:15 по Москве
  services: ["Мужская стрижка", "Оформление бороды"],
  totalPrice: 280_000,
  cancelledBy: null,
};

describe("formatNotification", () => {
  it("announces a new booking without personal details", () => {
    const text = plain(formatNotification("BOOKING_CREATED", booking));
    expect(text).toBe(
      [
        "🆕 <b>Новая запись</b>",
        "Иван, +7 999 *** ** 67",
        "Мужская стрижка, Оформление бороды",
        "Мастер: Дмитрий Волков",
        "ср, 4 ноября в 14:15",
        "Итого: 2 800 ₽",
      ].join("\n"),
    );
    expect(text).not.toContain("Петров");
    expect(text).not.toContain("1234567");
  });

  it("says who cancelled", () => {
    expect(
      formatNotification("BOOKING_CANCELLED", {
        ...booking,
        cancelledBy: "CLIENT",
      }).split("\n")[0],
    ).toBe("❌ <b>Запись отменена клиентом</b>");
    expect(
      formatNotification("BOOKING_CANCELLED", {
        ...booking,
        cancelledBy: "STAFF",
      }).split("\n")[0],
    ).toBe("❌ <b>Запись отменена салоном</b>");
  });

  it("escapes what visitors type, so they cannot inject markup", () => {
    const text = formatNotification("BOOKING_CREATED", {
      ...booking,
      clientName: '<a href="https://evil.example">Жми</a>',
    });
    expect(text).not.toContain("<a");
    expect(text).toContain("&lt;a");
  });
});
