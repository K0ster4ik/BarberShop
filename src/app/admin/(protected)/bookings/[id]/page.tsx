import { ArrowLeft, CalendarDays, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense } from "react";
import {
  DeleteBookingButton,
  EditBookingButton,
} from "@/components/admin/bookings/booking-detail-actions";
import {
  DISCOUNT_SOURCE_LABELS,
  SOURCE_LABELS,
} from "@/components/admin/bookings/labels";
import { BookingPayments } from "@/components/admin/bookings/payments";
import { StatusActions } from "@/components/admin/bookings/status-actions";
import { StatusBadge } from "@/components/admin/bookings/status-badge";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { formatDiscount, formatMoney, kopecksToRubles } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import {
  formatSalonDayTime,
  formatSalonTime,
  formatSalonVisit,
  toSalonDate,
} from "@/lib/time";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";
import {
  EDITABLE_BOOKING_STATUSES,
  nextStatuses,
} from "@/server/bookings/lifecycle";
import {
  type BookingDetail,
  getBookingDetail,
  loadTransferMasters,
} from "@/server/bookings/staff-queries";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Запись" };

export default function BookingPage({
  params,
}: PageProps<"/admin/bookings/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BookingCard params={params} />
    </Suspense>
  );
}

async function BookingCard({
  params,
}: Pick<PageProps<"/admin/bookings/[id]">, "params">) {
  const staff = await requireRole(...SECTION_ROLES.bookings);
  const { id } = await params;
  // MASTER чужую запись не получит: getBookingDetail ограничен его записями.
  const booking = await getBookingDetail(db, staff, id);
  if (!booking) notFound();

  const now = new Date();
  const manager = staff.role !== "MASTER";
  const editable =
    manager && EDITABLE_BOOKING_STATUSES.includes(booking.status);
  const transferMasters = editable
    ? await loadTransferMasters(
        db,
        booking,
        booking.items.map((item) => item.serviceId),
      )
    : [];
  const date = toSalonDate(booking.startsAt);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Link
          href="/admin/bookings"
          className="inline-flex min-h-11 items-center gap-1 text-muted-foreground hover:text-foreground sm:min-h-0"
        >
          <ArrowLeft className="size-4" aria-hidden /> Все записи
        </Link>
        <Link
          href={`/admin/calendar?date=${date}`}
          className="inline-flex min-h-11 items-center gap-1 text-muted-foreground hover:text-foreground sm:min-h-0"
        >
          <CalendarDays className="size-4" aria-hidden /> День в календаре
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {booking.client.name}
          </h1>
          <StatusBadge
            status={booking.status}
            totalPrice={booking.totalPrice}
            paid={booking.payments.reduce((sum, row) => sum + row.amount, 0)}
          />
        </div>
        <p className="text-lg">
          {formatSalonVisit(booking.startsAt)}–{formatSalonTime(booking.endsAt)}
          <span className="text-muted-foreground">
            {" "}
            · {booking.master.name}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <StatusActions
            bookingId={booking.id}
            allowed={nextStatuses(booking, staff.role, now)}
            totalPrice={booking.totalPrice}
            fromWebsite={booking.source === "WEBSITE"}
          />
          {editable && (
            <EditBookingButton
              bookingId={booking.id}
              masters={transferMasters}
              defaults={editDefaults(booking)}
            />
          )}
          {manager && <DeleteBookingButton bookingId={booking.id} />}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex flex-col gap-6">
          <Panel title="Услуги и цена">
            <ul className="flex flex-col gap-2">
              {booking.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    {item.serviceName}
                    <span className="text-sm text-muted-foreground">
                      {" "}
                      · {item.durationMin} мин
                      {item.isPriceManual && " · цена вручную"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    {item.masterDiscount > 0 && (
                      <s className="mr-1.5 text-sm text-muted-foreground">
                        {formatMoney(item.basePrice)}
                      </s>
                    )}
                    {formatMoney(item.price)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t pt-3 text-sm">
              {booking.salonDiscount > 0 && booking.salonDiscountSource && (
                <>
                  <dt className="text-muted-foreground">
                    Скидка:{" "}
                    {DISCOUNT_SOURCE_LABELS[booking.salonDiscountSource]}
                    {booking.promoCode && ` ${booking.promoCode.code}`}
                  </dt>
                  <dd className="text-right tabular-nums">
                    −{formatMoney(booking.salonDiscount)}
                  </dd>
                </>
              )}
              <dt className="text-base">Итого</dt>
              <dd className="text-right text-xl font-semibold tabular-nums">
                {formatMoney(booking.totalPrice)}
              </dd>
            </dl>
          </Panel>

          <Panel title="Визит">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
              <Row label="Мастер">{booking.master.name}</Row>
              <Row label="Длительность">
                {booking.durationMin} мин
                {booking.isDurationManual && " (задана вручную)"}, уборка{" "}
                {booking.bufferMin} мин
              </Row>
              <Row label="Источник">{SOURCE_LABELS[booking.source]}</Row>
              <Row label="Создана">
                {formatSalonDayTime(booking.createdAt)}
                {booking.createdBy && ` · ${booking.createdBy.name}`}
              </Row>
              {booking.confirmedAt && (
                <Row label="Подтверждена">
                  {formatSalonDayTime(booking.confirmedAt)}
                </Row>
              )}
              {booking.cancelledAt && (
                <Row label="Отменена">
                  {formatSalonDayTime(booking.cancelledAt)}
                  {booking.cancelledBy === "CLIENT"
                    ? " · клиентом"
                    : " · салоном"}
                </Row>
              )}
              {booking.clientComment && (
                <Row label="Комментарий клиента">
                  <span className="whitespace-pre-line">
                    {booking.clientComment}
                  </span>
                </Row>
              )}
            </dl>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Клиент">
            <p className="font-medium">{booking.client.name}</p>
            <a
              href={`tel:${booking.client.phone}`}
              className="inline-flex min-h-11 w-fit items-center gap-2 text-primary underline-offset-4 hover:underline sm:min-h-0"
            >
              <Phone className="size-4" aria-hidden />
              {formatPhone(booking.client.phone)}
            </a>
            {booking.client.discountKind && booking.client.discountValue && (
              <p className="text-sm text-muted-foreground">
                Постоянная скидка{" "}
                {formatDiscount(
                  booking.client.discountKind,
                  booking.client.discountValue,
                )}
              </p>
            )}
          </Panel>
          <Panel title="Оплата">
            <BookingPayments
              bookingId={booking.id}
              totalPrice={booking.totalPrice}
              canPay={booking.status === "COMPLETED"}
              canRemove={manager}
              payments={booking.payments.map((payment) => ({
                id: payment.id,
                amount: payment.amount,
                method: payment.method,
                paidAt: formatSalonDayTime(payment.paidAt),
              }))}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function editDefaults(booking: BookingDetail) {
  const discountMode =
    booking.salonDiscountSource === "MANUAL"
      ? "manual"
      : booking.salonDiscountSource
        ? "auto"
        : "none";
  return {
    masterId: booking.masterId,
    date: toSalonDate(booking.startsAt),
    time: formatSalonTime(booking.startsAt),
    durationMin: booking.isDurationManual ? booking.durationMin : null,
    discount: {
      mode: discountMode,
      kind: "AMOUNT",
      value:
        discountMode === "manual"
          ? kopecksToRubles(booking.salonDiscount)
          : null,
    },
    prices: Object.fromEntries(
      booking.items.map((item) => [
        item.id,
        item.isPriceManual ? kopecksToRubles(item.price) : null,
      ]),
    ),
    items: booking.items.map((item) => ({
      key: item.id,
      name: item.serviceName,
    })),
    promoCode: booking.promoCode?.code ?? null,
  } as const;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
