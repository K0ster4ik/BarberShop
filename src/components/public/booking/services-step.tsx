"use client";

import { ArrowRight, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_SERVICES_PER_BOOKING } from "@/lib/validation/booking";
import { cn } from "@/lib/utils";
import type { CatalogCategory } from "@/server/bookings/offer";
import { BookingFrame } from "./frame";
import { formatDurationRange, formatPriceRange, servicesCount } from "./format";
import { SelectionSummary } from "./selection-summary";
import { wizardHref } from "./wizard-state";

/** Шаг 1: услуги по категориям, можно несколько. */
export function ServicesStep({
  categories,
  selected: initial,
}: {
  categories: CatalogCategory[];
  selected: string[];
}) {
  const router = useRouter();
  const all = categories.flatMap((category) => category.services);
  const [selected, setSelected] = useState(() =>
    initial.filter((id) => all.some((service) => service.id === id)),
  );
  const chosen = all.filter((service) => selected.includes(service.id));
  const full = selected.length >= MAX_SERVICES_PER_BOOKING;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  const minTotal = chosen.reduce((sum, service) => sum + service.minPrice, 0);
  const next = (
    <Button
      size="lg"
      className="h-11 shrink-0"
      disabled={chosen.length === 0}
      onClick={() =>
        router.push(wizardHref({ step: "master", serviceIds: selected }))
      }
    >
      Дальше — мастер <ArrowRight aria-hidden />
    </Button>
  );

  return (
    <BookingFrame
      summary={
        chosen.length ? (
          <SelectionSummary
            services={chosen.map((service) => service.name)}
            price={
              <p className="text-lg font-semibold">
                от {formatPriceRange(minTotal, minTotal)}
              </p>
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Выберите одну или несколько услуг — например, стрижку и бороду.
          </p>
        )
      }
      barSummary={
        chosen.length ? (
          <>
            <p className="font-semibold">
              от {formatPriceRange(minTotal, minTotal)}
            </p>
            <p className="truncate text-muted-foreground">
              {servicesCount(chosen.length)}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">Выберите услугу</p>
        )
      }
      action={next}
    >
      {categories.map((category) => (
        <section key={category.id} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{category.name}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {category.services.map((service) => {
              const checked = selected.includes(service.id);
              const disabled = !checked && full;
              return (
                <li key={service.id}>
                  <button
                    type="button"
                    aria-pressed={checked}
                    disabled={disabled}
                    onClick={() => toggle(service.id)}
                    className={cn(
                      "flex h-full w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                      checked
                        ? "border-primary ring-1 ring-primary"
                        : "hover:border-primary/50",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-input",
                        checked &&
                          "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {checked && <Check className="size-3.5" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium">{service.name}</span>
                      {service.description && (
                        <span className="line-clamp-2 text-sm text-muted-foreground">
                          {service.description}
                        </span>
                      )}
                      <span className="text-sm">
                        <span className="font-medium">
                          {service.minPrice === service.maxPrice ? "" : "от "}
                          {formatPriceRange(service.minPrice, service.minPrice)}
                        </span>
                        <span className="text-muted-foreground">
                          {" · "}
                          {formatDurationRange(
                            service.minDurationMin,
                            service.maxDurationMin,
                          )}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {full && (
        <p className="text-sm text-muted-foreground" role="status">
          За один визит — не больше {MAX_SERVICES_PER_BOOKING} услуг.
        </p>
      )}
    </BookingFrame>
  );
}
