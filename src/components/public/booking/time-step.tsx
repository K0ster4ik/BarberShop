"use client";

import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { timeToMinutes, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { BookingFrame } from "./frame";
import { SelectionSummary, type SummaryMaster } from "./selection-summary";
import { type WizardState, wizardHref } from "./wizard-state";

// Названия — свои, а не из Intl: у сервера и браузера разные версии ICU,
// и подписи календаря не должны расходиться при гидратации.
const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];
const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const PARTS = [
  { label: "Утро", until: 12 * 60 },
  { label: "День", until: 17 * 60 },
  { label: "Вечер", until: 24 * 60 },
];

export type DaySlots = { date: string; times: string[] };

function dayLabel(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${WEEKDAYS[weekdayOf(date)]}, ${day} ${MONTHS_GENITIVE[(month ?? 1) - 1]}`;
}

/** Шаг 3: календарь на горизонт записи и свободное время выбранного дня. */
export function TimeStep({
  state,
  days,
  services,
  duration,
  master,
  price,
}: {
  state: WizardState;
  days: DaySlots[];
  services: string[];
  duration: string;
  master: SummaryMaster | "any";
  price: string; // строка, а не элемент: элементы с сервера React проверяет как список
}) {
  const router = useRouter();
  const available = days.filter((day) => day.times.length > 0);
  const [date, setDate] = useState(
    () =>
      available.find((day) => day.date === state.date)?.date ??
      available[0]?.date ??
      null,
  );
  const months = [...new Set(days.map((day) => day.date.slice(0, 7)))];
  const [month, setMonth] = useState(
    () => date?.slice(0, 7) ?? months[0] ?? "",
  );
  const times = days.find((day) => day.date === date)?.times ?? [];

  function pickDate(next: string) {
    setDate(next);
    // Адрес обновляется без запроса к серверу: все времена уже на странице.
    window.history.replaceState(
      null,
      "",
      wizardHref({ ...state, step: "time", date: next, time: null }),
    );
  }

  const back = (
    <Button asChild variant="outline" size="lg" className="h-11 shrink-0">
      <Link href={wizardHref({ ...state, step: "master" })}>
        <ArrowLeft aria-hidden /> Мастер
      </Link>
    </Button>
  );
  const summary = (
    <SelectionSummary
      services={services}
      duration={duration}
      master={master}
      price={<p className="text-lg font-semibold">{price}</p>}
    />
  );

  if (available.length === 0) {
    return (
      <BookingFrame
        summary={summary}
        barSummary={
          <p className="text-muted-foreground">Нет свободного времени</p>
        }
        action={back}
      >
        <p className="rounded-xl border border-dashed p-6 text-muted-foreground">
          В ближайшие {days.length} дней свободного времени нет. Выберите
          другого мастера или «любого мастера».
        </p>
      </BookingFrame>
    );
  }

  const monthIndex = months.indexOf(month);
  const [year, monthNumber] = month.split("-").map(Number);
  const first = `${month}-01`;
  const lead = weekdayOf(first);
  const daysInMonth = new Date(
    Date.UTC(year ?? 2000, monthNumber ?? 1, 0),
  ).getUTCDate();
  const byDate = new Map(days.map((day) => [day.date, day.times.length]));
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
    ),
  ];

  return (
    <BookingFrame
      summary={summary}
      barSummary={
        <p className="truncate text-muted-foreground">
          {date ? dayLabel(date) : "Выберите день"} — выберите время
        </p>
      }
      action={back}
    >
      <div className="grid gap-6 rounded-xl border bg-card p-4 sm:p-5 xl:grid-cols-2">
        <section aria-label="Календарь" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              {MONTHS[(monthNumber ?? 1) - 1]} {year}
            </h2>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Предыдущий месяц"
                disabled={monthIndex <= 0}
                onClick={() => setMonth(months[monthIndex - 1] ?? month)}
              >
                <ChevronLeft aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Следующий месяц"
                disabled={monthIndex >= months.length - 1}
                onClick={() => setMonth(months[monthIndex + 1] ?? month)}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {WEEKDAYS.map((name) => (
              <span key={name} aria-hidden>
                {name}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, index) => {
              if (!cell) return <span key={`lead-${index}`} />;
              const free = byDate.get(cell) ?? 0;
              const selected = cell === date;
              return (
                <button
                  key={cell}
                  type="button"
                  disabled={free === 0}
                  aria-pressed={selected}
                  aria-label={`${dayLabel(cell)}${free === 0 ? ", нет свободного времени" : ""}`}
                  onClick={() => pickDate(cell)}
                  className={cn(
                    "flex aspect-square min-h-10 items-center justify-center rounded-lg text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    selected
                      ? "bg-primary font-semibold text-primary-foreground"
                      : "hover:bg-accent",
                    free === 0 &&
                      "cursor-not-allowed text-muted-foreground/60 line-through hover:bg-transparent",
                  )}
                >
                  {Number(cell.slice(8))}
                </button>
              );
            })}
          </div>
        </section>

        <section aria-label="Время" className="flex flex-col gap-4">
          {date && <h2 className="font-semibold">{dayLabel(date)}</h2>}
          {PARTS.map((part, index) => {
            const from = PARTS[index - 1]?.until ?? 0;
            const inPart = times.filter((time) => {
              const minutes = timeToMinutes(time) ?? 0;
              return minutes >= from && minutes < part.until;
            });
            if (inPart.length === 0) return null;
            return (
              <div key={part.label} className="flex flex-col gap-2">
                <h3 className="text-sm text-muted-foreground">{part.label}</h3>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 xl:grid-cols-4">
                  {inPart.map((time) => {
                    const selected = date === state.date && time === state.time;
                    return (
                      <Button
                        key={time}
                        variant={selected ? "default" : "outline"}
                        className="h-11 tabular-nums"
                        aria-pressed={selected}
                        onClick={() =>
                          router.push(
                            wizardHref({
                              ...state,
                              step: "contacts",
                              date,
                              time,
                            }),
                          )
                        }
                      >
                        {time}
                      </Button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </BookingFrame>
  );
}
