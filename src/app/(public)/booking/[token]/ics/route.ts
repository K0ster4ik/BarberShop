import { env } from "@/env";
import { db } from "@/server/db";
import { loadBookingByToken } from "@/server/bookings/cancel";
import { buildBookingIcs } from "@/server/bookings/ics";

// «Добавить в календарь»: событие с ссылкой на страницу записи (DESIGN.md, 7.1).

export async function GET(
  _request: Request,
  { params }: RouteContext<"/booking/[token]/ics">,
) {
  const { token } = await params;
  const booking = await loadBookingByToken(db, token);
  if (!booking) return new Response("Запись не найдена", { status: 404 });

  const ics = buildBookingIcs({
    bookingId: booking.id,
    status: booking.status,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    services: booking.items.map((item) => item.serviceName),
    masterName: booking.master.name,
    totalPrice: booking.totalPrice,
    url: new URL(`/booking/${token}`, env.APP_URL).toString(),
    now: new Date(),
  });
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="barbershop.ics"',
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
