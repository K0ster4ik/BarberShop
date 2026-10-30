import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NewBookingForm } from "@/components/admin/bookings/booking-form";
import { PageHeader } from "@/components/admin/page-header";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { timeToMinutes } from "@/lib/time";
import { requireRole } from "@/server/auth";
import { MANAGER_ROLES } from "@/server/auth/access";
import {
  boardDate,
  loadBookingFormMasters,
} from "@/server/bookings/staff-queries";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Новая запись" };

export default function NewBookingPage({
  searchParams,
}: PageProps<"/admin/bookings/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewBooking searchParams={searchParams} />
    </Suspense>
  );
}

async function NewBooking({
  searchParams,
}: Pick<PageProps<"/admin/bookings/new">, "searchParams">) {
  await requireRole(...MANAGER_ROLES);
  const params = await searchParams;
  const masters = await loadBookingFormMasters(db);
  // Из календаря приходят мастер, день и время — форма открывается с ними.
  const masterId = typeof params.master === "string" ? params.master : null;
  const time = typeof params.time === "string" ? params.time : "";
  // Из карточки клиента приходят его телефон и имя.
  const text = (value: unknown, max: number) =>
    typeof value === "string" ? value.slice(0, max) : "";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/bookings"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:min-h-0"
      >
        <ArrowLeft className="size-4" aria-hidden /> Все записи
      </Link>
      <PageHeader
        title="Новая запись"
        description="Запись по телефону или клиент пришёл сам. Создаётся подтверждённой и в Telegram-канал не уходит."
      />
      {masters.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-muted-foreground">
          Нет активных мастеров. Добавьте мастера и его услуги в разделе
          «Мастера».
        </p>
      ) : (
        <NewBookingForm
          masters={masters}
          defaults={{
            masterId: masters.some((master) => master.id === masterId)
              ? masterId
              : null,
            date: boardDate(
              typeof params.date === "string" ? params.date : undefined,
              new Date(),
            ),
            time: timeToMinutes(time) === null ? "" : time,
            phone: text(params.phone, 40),
            name: text(params.name, 60),
          }}
        />
      )}
    </div>
  );
}
