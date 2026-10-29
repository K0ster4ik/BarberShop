import { ArrowRight, CalendarClock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import interior from "../../../../public/images/salon-interior.webp";

/**
 * Первый экран: фото интерьера на всю ширину. Текст лежит на фото, поэтому затемнение
 * и светлый текст одинаковы в обеих темах. `children` — строка с ценой: она приходит из БД
 * следом, а первый экран остаётся статическим.
 */
export function Hero({ children }: { children?: ReactNode }) {
  return (
    <section className="relative isolate flex min-h-[68svh] items-end overflow-hidden md:min-h-[640px] md:items-center">
      <Image
        src={interior}
        alt=""
        fill
        preload
        sizes="100vw"
        placeholder="blur"
        className="-z-10 object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/55 to-black/30 md:bg-linear-to-r md:from-black/80 md:via-black/50 md:to-black/10"
      />
      <div className="mx-auto w-full max-w-6xl px-4 pt-16 pb-10 md:py-24">
        <div className="flex max-w-xl flex-col gap-5 text-white">
          <p className="w-fit rounded-full border border-white/30 bg-black/30 px-3 py-1 text-sm text-white/90">
            Демо-проект — попробуйте онлайн-запись
          </p>
          <h1 className="font-display text-5xl leading-[1.05] font-semibold text-balance sm:text-6xl">
            Твой стиль. Твоё место.
          </h1>
          <p className="max-w-md text-lg text-white/85">
            Мужские стрижки и уход за бородой. Запись онлайн за минуту — без
            регистрации.
            {children}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-6 text-base">
              <Link href="/book">
                <CalendarClock aria-hidden /> Записаться онлайн
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 border-white/70 bg-black/45 px-6 text-base text-white hover:bg-black/60 hover:text-white"
            >
              <Link href="#services">
                Цены <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
