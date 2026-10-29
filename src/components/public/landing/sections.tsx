import {
  ArrowRight,
  Brush,
  CalendarClock,
  ChevronRight,
  Droplet,
  Phone,
  Scissors,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { cache, type ReactNode } from "react";
import { MasterAvatar } from "@/components/master-avatar";
import { wizardHref } from "@/components/public/booking/wizard-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { env } from "@/env";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db";
import {
  type FeaturedService,
  loadFeaturedServices,
  loadMasterCards,
} from "@/server/site/landing";
import { formatDurationRange } from "../booking/format";

// Блоки главной страницы под первым экраном (docs/design/landing-concept-*.webp).

// Витрина нужна и услугам, и мастерам: в одном запросе каталог грузится один раз.
const featuredServices = cache(() => loadFeaturedServices(db, new Date()));

export function Section({
  id,
  title,
  link,
  children,
}: {
  id?: string;
  title: string;
  link?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12 md:py-16">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">
            {title}
          </h2>
          {link && (
            <Link
              href={link.href}
              className="flex shrink-0 items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
            >
              {link.label} <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

const CATEGORY_ICONS: [RegExp, typeof Scissors][] = [
  [/борода|бритьё/i, Brush],
  [/комплекс/i, Sparkles],
  [/окраш|цвет/i, Droplet],
];

function serviceIcon(service: FeaturedService) {
  return (
    CATEGORY_ICONS.find(([pattern]) =>
      pattern.test(service.categoryName),
    )?.[1] ?? Scissors
  );
}

/** Карточки услуг: нажатие открывает запись с этой услугой. */
export async function ServicesGrid() {
  await connection();
  const services = await featuredServices();
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {services.map((service) => {
        const Icon = serviceIcon(service);
        return (
          <li key={service.id}>
            <Link
              href={wizardHref({ step: "master", serviceIds: [service.id] })}
              className="group flex h-full items-center gap-4 rounded-xl border bg-card p-4 transition-colors outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Icon className="size-7 shrink-0 text-primary" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">{service.name}</span>
                <span className="text-sm text-muted-foreground">
                  от{" "}
                  <span className="font-medium text-foreground">
                    {formatMoney(service.minPrice)}
                  </span>
                  {" · "}
                  {formatDurationRange(
                    service.minDurationMin,
                    service.maxDurationMin,
                  )}
                </span>
              </span>
              <ChevronRight
                className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Мастера с ближайшим свободным временем на первую услугу витрины. */
export async function MastersGrid() {
  await connection();
  const [first] = await featuredServices();
  const masters = await loadMasterCards(db, first?.id ?? null, new Date());
  return (
    <>
      {first && (
        <p className="-mt-3 text-sm text-muted-foreground">
          Ближайшее свободное время — на услугу «{first.name}».
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {masters.map((master) => (
          <li
            key={master.id}
            className="flex flex-col overflow-hidden rounded-xl border bg-card"
          >
            <MasterAvatar
              name={master.name}
              photoPath={master.photoPath}
              sizes="(min-width: 1024px) 280px, (min-width: 640px) 45vw, 50vw"
              className="rounded-none"
            />
            <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
              <div>
                <p className="font-medium">{master.name}</p>
                <p className="text-sm text-muted-foreground">
                  {master.title ?? "Мастер"}
                </p>
              </div>
              <p className="flex gap-2 text-sm">
                <CalendarClock
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden
                />
                {master.nearest ? (
                  <span>
                    <span className="text-muted-foreground">Ближайшее: </span>
                    <span className="font-medium">{master.nearest.label}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    На неделе всё занято
                  </span>
                )}
              </p>
              <Button asChild className="mt-auto h-11">
                <Link
                  href={
                    first
                      ? wizardHref({
                          step: "time",
                          serviceIds: [first.id],
                          masterId: master.id,
                          date: master.nearest?.date ?? null,
                        })
                      : "/book"
                  }
                >
                  Записаться
                  <span className="sr-only"> к мастеру {master.name}</span>
                </Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

const STEPS = [
  { icon: Scissors, title: "Услуга", text: "Одна или несколько" },
  { icon: UserRound, title: "Мастер", text: "Любой или конкретный" },
  { icon: CalendarClock, title: "Время", text: "Только свободное" },
  { icon: Phone, title: "Контакты", text: "Имя и телефон" },
];

export function HowToBook() {
  return (
    <ol className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
      {STEPS.map((step, index) => (
        <li key={step.title} className="flex flex-col items-start gap-3">
          <span className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full border border-primary/50 text-primary">
              <step.icon className="size-5" aria-hidden />
            </span>
            <span className="text-sm text-muted-foreground">
              Шаг {index + 1}
            </span>
          </span>
          <span>
            <span className="block font-medium">{step.title}</span>
            <span className="block text-sm text-muted-foreground">
              {step.text}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Открытый канал с заявками — особенность демо. Без настроенного канала блока нет. */
export function TelegramBlock() {
  if (!env.TELEGRAM_CHANNEL_URL) return null;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-12 md:pb-16">
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:p-6">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Send className="size-5" aria-hidden />
        </span>
        <div className="flex-1">
          <p className="font-medium">Заявки — в открытом Telegram-канале</p>
          <p className="text-sm text-muted-foreground">
            Запишитесь и посмотрите, как заявка появится в канале. Телефон там
            скрыт.
          </p>
        </div>
        <Button asChild variant="outline" size="lg" className="h-11">
          <a href={env.TELEGRAM_CHANNEL_URL} target="_blank" rel="noreferrer">
            Открыть канал <ArrowRight aria-hidden />
          </a>
        </Button>
      </div>
    </div>
  );
}

export function CardsSkeleton({
  count,
  className,
}: {
  count: number;
  className: string;
}) {
  return (
    <div className={className} aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-full min-h-20 rounded-xl" />
      ))}
    </div>
  );
}
