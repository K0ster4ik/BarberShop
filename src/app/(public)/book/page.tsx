import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { BookingWizard } from "@/components/public/booking/booking-wizard";
import { Skeleton } from "@/components/ui/skeleton";
import interior from "../../../../public/images/salon-interior.webp";

export const metadata: Metadata = {
  title: "Онлайн-запись",
  description: "Запишитесь в барбершоп за минуту: услуга, мастер, время.",
};

export default function BookPage({ searchParams }: PageProps<"/book">) {
  return (
    <>
      <div className="relative hidden h-44 overflow-hidden md:block">
        <Image
          src={interior}
          alt=""
          fill
          // На телефоне шапки нет: без предзагрузки фото туда не скачивается.
          sizes="(min-width: 768px) 100vw, 1px"
          placeholder="blur"
          className="object-cover"
        />
        {/* Фото уходит в цвет страницы — в обеих темах шапка не обрывается краем. */}
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-background/20 to-background" />
      </div>
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-32 lg:pb-12">
        <Suspense fallback={<WizardSkeleton />}>
          <BookingWizard searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

function WizardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загружаем свободное время…</span>
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
