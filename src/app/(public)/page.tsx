import type { Metadata } from "next";
import { Suspense } from "react";
import { Hero } from "@/components/public/landing/hero";
import {
  CardsSkeleton,
  HeroPrice,
  HeroPriceSkeleton,
  HowToBook,
  MastersGrid,
  Section,
  ServicesGrid,
  TelegramBlock,
} from "@/components/public/landing/sections";

export const metadata: Metadata = {
  title: { absolute: "Барбершоп — стрижки и уход за бородой" },
  description:
    "Мужские стрижки, борода и бритьё. Онлайн-запись за минуту без регистрации.",
};

// Первый экран и «Как записаться» — статические, сразу в оболочке страницы; цены и
// свободное время мастеров считаются на запрос и приходят следом.
export default function HomePage() {
  return (
    <>
      <Hero>
        <Suspense fallback={<HeroPriceSkeleton />}>
          <HeroPrice />
        </Suspense>
      </Hero>
      <Section
        id="services"
        title="Услуги"
        link={{ href: "/book", label: "Все услуги" }}
      >
        <Suspense
          fallback={
            <CardsSkeleton
              count={6}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            />
          }
        >
          <ServicesGrid />
        </Suspense>
      </Section>
      <Section id="masters" title="Мастера">
        <Suspense
          fallback={
            <CardsSkeleton
              count={4}
              className="grid aspect-[2/1] grid-cols-2 gap-3 lg:aspect-[4/1] lg:grid-cols-4"
            />
          }
        >
          <MastersGrid />
        </Suspense>
      </Section>
      <Section title="Как записаться">
        <p className="-mt-3 text-muted-foreground">
          Меньше минуты, без регистрации и звонков.
        </p>
        <HowToBook />
      </Section>
      <TelegramBlock />
    </>
  );
}
