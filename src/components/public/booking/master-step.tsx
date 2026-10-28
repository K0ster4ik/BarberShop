import { ArrowLeft, ArrowRight, Scissors } from "lucide-react";
import Link from "next/link";
import { MasterAvatar } from "@/components/master-avatar";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { type MasterOffer, offerPrice } from "@/server/bookings/offer";
import { BookingFrame } from "./frame";
import {
  formatDuration,
  formatDurationRange,
  formatPriceRange,
} from "./format";
import { SelectionSummary } from "./selection-summary";
import { ANY_MASTER, type WizardState, wizardHref } from "./wizard-state";

/** Шаг 2: мастера, которые делают все выбранные услуги, и «любой мастер». */
export function MasterStep({
  state,
  offers,
  services,
  now,
}: {
  state: WizardState;
  offers: MasterOffer[];
  services: string[];
  now: Date;
}) {
  const back = (
    <Button asChild variant="outline" size="lg" className="h-11 shrink-0">
      <Link href={wizardHref({ ...state, step: "services" })}>
        <ArrowLeft aria-hidden /> Услуги
      </Link>
    </Button>
  );

  if (offers.length === 0) {
    return (
      <BookingFrame
        summary={<SelectionSummary services={services} />}
        barSummary={<p className="text-muted-foreground">Мастер не найден</p>}
        action={back}
      >
        <p className="rounded-xl border border-dashed p-6 text-muted-foreground">
          Ни один мастер не делает все эти услуги за один визит. Уберите одну из
          услуг — и выбор появится.
        </p>
      </BookingFrame>
    );
  }

  const priced = offers.map((offer) => {
    const pricing = offerPrice(offer, now);
    const full = offer.services.reduce((sum, row) => sum + row.basePrice, 0);
    return { offer, price: pricing.subtotal, full };
  });
  const prices = priced.map((row) => row.price);
  const durations = offers.map((offer) => offer.durationMin);
  const href = (masterId: string) =>
    wizardHref({ ...state, step: "time", masterId, date: null, time: null });

  const cardClass = (selected: boolean) =>
    cn(
      "flex h-full items-center gap-4 rounded-xl border bg-card p-4 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      selected
        ? "border-primary ring-1 ring-primary"
        : "hover:border-primary/50",
    );

  return (
    <BookingFrame
      summary={<SelectionSummary services={services} />}
      barSummary={
        <p className="text-muted-foreground">Выберите мастера или «любого»</p>
      }
      action={back}
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        <li>
          <Link
            href={href(ANY_MASTER)}
            className={cardClass(state.masterId === ANY_MASTER)}
          >
            <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Scissors className="size-6" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-medium">Любой мастер</span>
              <span className="text-sm text-muted-foreground">
                Покажем всё свободное время и назначим мастера
              </span>
              <span className="text-sm">
                <span className="font-medium">
                  {formatPriceRange(Math.min(...prices), Math.max(...prices))}
                </span>
                <span className="text-muted-foreground">
                  {" · "}
                  {formatDurationRange(
                    Math.min(...durations),
                    Math.max(...durations),
                  )}
                </span>
              </span>
            </span>
            <ArrowRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </Link>
        </li>
        {priced.map(({ offer, price, full }) => (
          <li key={offer.master.id}>
            <Link
              href={href(offer.master.id)}
              className={cardClass(state.masterId === offer.master.id)}
            >
              <MasterAvatar
                name={offer.master.name}
                photoPath={offer.master.photoPath}
                sizes="64px"
                className="size-16 shrink-0 rounded-full [&>span]:text-base"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-medium">{offer.master.name}</span>
                <span className="text-sm text-muted-foreground">
                  {offer.master.title ?? "Мастер"}
                </span>
                <span className="text-sm">
                  <span className="font-medium">{formatMoney(price)}</span>
                  {price < full && (
                    <>
                      {" "}
                      <s className="text-muted-foreground">
                        {formatMoney(full)}
                      </s>
                      <span className="sr-only">
                        {" "}
                        — цена со скидкой мастера
                      </span>
                    </>
                  )}
                  <span className="text-muted-foreground">
                    {" · "}
                    {formatDuration(offer.durationMin)}
                  </span>
                </span>
              </span>
              <ArrowRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </BookingFrame>
  );
}
