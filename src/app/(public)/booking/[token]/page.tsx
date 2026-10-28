import { CalendarPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { MasterAvatar } from "@/components/master-avatar";
import { CancelBookingButton } from "@/components/public/booking/cancel-booking-button";
import { CopyLinkButton } from "@/components/public/booking/copy-link-button";
import { formatDuration } from "@/components/public/booking/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { salon } from "@/config/salon";
import { env } from "@/env";
import type { BookingStatus } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/money";
import { formatSalonVisit } from "@/lib/time";
import {
  BOOKING_NOT_FOUND,
  canCancel,
  loadBookingByToken,
} from "@/server/bookings/cancel";
import { db } from "@/server/db";

// Ссылка из подтверждения (DESIGN.md, 7.5): сводка, календарь, отмена. Токен в адресе —
// это ключ к записи, поэтому страница не индексируется и не отдаёт Referer.
export const metadata: Metadata = {
  title: "Ваша запись",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const STATUS: Record<
  BookingStatus,
  { badge: string; title: string; text?: string }
> = {
  PENDING: {
    badge: "Ожидает подтверждения",
    title: "Заявка принята",
    text: "Мастер подтвердит запись — статус обновится на этой странице. Если время не подойдёт, салон позвонит.",
  },
  CONFIRMED: { badge: "Подтверждена", title: "Ждём вас" },
  COMPLETED: { badge: "Состоялась", title: "Спасибо за визит" },
  CANCELLED: { badge: "Отменена", title: "Запись отменена" },
  NO_SHOW: { badge: "Не состоялась", title: "Визит не состоялся" },
};

export default function BookingPage({ params }: PageProps<"/booking/[token]">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <BookingDetails params={params} />
      </Suspense>
    </div>
  );
}

async function BookingDetails({
  params,
}: Pick<PageProps<"/booking/[token]">, "params">) {
  const { token } = await params;
  await connection();
  const booking = await loadBookingByToken(db, token);
  if (!booking) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed p-6">
        <h1 className="text-2xl font-semibold">Запись не найдена</h1>
        <p className="text-muted-foreground">{BOOKING_NOT_FOUND}</p>
        <Button asChild size="lg" className="h-11">
          <Link href="/book">Записаться заново</Link>
        </Button>
      </div>
    );
  }

  const now = new Date();
  const status = STATUS[booking.status];
  const active = booking.status === "PENDING" || booking.status === "CONFIRMED";
  const cancellable = canCancel(booking, now);

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Badge
          variant={booking.status === "CANCELLED" ? "secondary" : "default"}
          className="w-fit"
        >
          {status.badge}
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">
          {status.title}
        </h1>
        {active && status.text && (
          <p className="text-muted-foreground">{status.text}</p>
        )}
      </header>

      <section className="flex flex-col gap-5 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-4">
          <MasterAvatar
            name={booking.master.name}
            photoPath={booking.master.photoPath}
            sizes="64px"
            className="size-16 shrink-0 rounded-full [&>span]:text-base"
          />
          <div>
            <p className="text-lg font-semibold">
              {formatSalonVisit(booking.startsAt)}
            </p>
            <p className="text-muted-foreground">
              {booking.master.name} ·{" "}
              <span className="whitespace-nowrap">
                {booking.master.title ?? "Мастер"}
              </span>{" "}
              ·{" "}
              <span className="whitespace-nowrap">
                {formatDuration(booking.durationMin)}
              </span>
            </p>
          </div>
        </div>

        <dl className="flex flex-col gap-2 text-sm">
          {booking.items.map((item) => (
            <div key={item.serviceName} className="flex justify-between gap-3">
              <dt>{item.serviceName}</dt>
              <dd className="shrink-0 tabular-nums">
                {item.masterDiscount > 0 && (
                  <s className="mr-1.5 text-muted-foreground">
                    {formatMoney(item.basePrice)}
                  </s>
                )}
                {formatMoney(item.price)}
              </dd>
            </div>
          ))}
          {booking.salonDiscount > 0 && (
            <div className="flex justify-between gap-3 text-primary">
              <dt>
                {booking.promoCode
                  ? `Промокод ${booking.promoCode.code}`
                  : booking.salonDiscountSource === "CLIENT"
                    ? "Постоянная скидка"
                    : "Скидка салона"}
              </dt>
              <dd className="shrink-0 tabular-nums">
                −{formatMoney(booking.salonDiscount)}
              </dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3 border-t pt-3">
            <dt className="font-medium">Итого</dt>
            <dd className="text-xl font-semibold tabular-nums">
              {formatMoney(booking.totalPrice)}
            </dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">
          Оплата в салоне после визита.
        </p>
      </section>

      {active && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-11">
            <a href={`/booking/${token}/ics`} download="barbershop.ics">
              <CalendarPlus aria-hidden /> Добавить в календарь
            </a>
          </Button>
          <CopyLinkButton />
          {cancellable && <CancelBookingButton token={token} />}
        </div>
      )}
      {active && !cancellable && (
        <p className="text-sm text-muted-foreground">
          Отменить запись на сайте можно не позже чем за{" "}
          {salon.clientCancelLeadTimeMin / 60} ч до начала.
        </p>
      )}
      {active && (
        <p className="text-sm text-muted-foreground">
          Сохраните ссылку на эту страницу — без неё запись не посмотреть и не
          отменить. Она же есть в событии календаря.
          {env.TELEGRAM_CHANNEL_URL && (
            <>
              {" "}
              Ваша заявка уже в{" "}
              <a
                href={env.TELEGRAM_CHANNEL_URL}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                нашем Telegram-канале
              </a>{" "}
              — телефон там скрыт.
            </>
          )}
        </p>
      )}
      {booking.status === "CANCELLED" && (
        <Button asChild size="lg" className="h-11 w-fit">
          <Link href="/book">Записаться снова</Link>
        </Button>
      )}
    </article>
  );
}
