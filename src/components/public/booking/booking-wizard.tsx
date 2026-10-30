import { getCountries, getCountryCallingCode } from "libphonenumber-js";
import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { formatSalonVisit, minutesToTime, toSalonMinutes } from "@/lib/time";
import { ANY_MASTER, bookingSelectionSchema } from "@/lib/validation/booking";
import { bookingDates, loadAvailability } from "@/server/bookings/availability";
import {
  loadBookingCatalog,
  loadOffers,
  type MasterOffer,
  offerPrice,
} from "@/server/bookings/offer";
import { quoteBooking } from "@/server/bookings/quote";
import { toQuoteView } from "@/server/bookings/quote-view";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { ContactsStep } from "./contacts-step";
import type { CountryOption } from "./country-picker";
import {
  formatDuration,
  formatDurationRange,
  formatPriceRange,
} from "./format";
import { MasterStep } from "./master-step";
import { ServicesStep } from "./services-step";
import { Stepper } from "./stepper";
import { TimeStep } from "./time-step";
import {
  parseWizardState,
  type StepId,
  type WizardState,
  wizardHref,
} from "./wizard-state";

const HEADINGS: Record<StepId, string> = {
  services: "Что делаем?",
  master: "К кому записаться?",
  time: "Когда вам удобно?",
  contacts: "Остался последний шаг",
};

/** Мастер записи: шаг и данные берутся из адреса страницы. */
export async function BookingWizard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseWizardState(await searchParams);
  // Свободное время считается на момент запроса: страница всегда рендерится заново.
  await connection();
  const now = new Date();
  return (
    <div className="flex flex-col gap-6">
      <Stepper state={state} />
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {HEADINGS[state.step]}
      </h1>
      {await stepContent(state, now)}
    </div>
  );
}

async function stepContent(state: WizardState, now: Date): Promise<ReactNode> {
  if (state.step === "services") {
    const categories = await loadBookingCatalog(db, now);
    return <ServicesStep categories={categories} selected={state.serviceIds} />;
  }

  let offers: MasterOffer[];
  try {
    offers = await loadOffers(db, state.serviceIds);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return (
      <StepNotice
        message={error.message}
        href={wizardHref({ step: "services" })}
        label="Выбрать услуги"
      />
    );
  }
  const services = await serviceNames(state.serviceIds);

  if (state.step === "master") {
    return (
      <MasterStep state={state} offers={offers} services={services} now={now} />
    );
  }

  const chosen =
    state.masterId === ANY_MASTER
      ? offers
      : offers.filter((offer) => offer.master.id === state.masterId);
  const single = state.masterId === ANY_MASTER ? null : chosen[0];
  if (chosen.length === 0) {
    return (
      <StepNotice
        message="Этот мастер больше не делает выбранные услуги."
        href={wizardHref({ ...state, step: "master" })}
        label="Выбрать мастера"
      />
    );
  }

  if (state.step === "time") {
    const dates = bookingDates(now);
    const availability = await loadAvailability(db, chosen, dates, now);
    const prices = chosen.map((offer) => offerPrice(offer, now).subtotal);
    const durations = chosen.map((offer) => offer.durationMin);
    return (
      <TimeStep
        state={state}
        days={dates.map((date) => ({
          date,
          times: (availability.get(date) ?? []).map((slot) =>
            minutesToTime(toSalonMinutes(slot.start)),
          ),
        }))}
        services={services}
        master={single ? single.master : "any"}
        duration={
          single
            ? formatDuration(single.durationMin)
            : formatDurationRange(
                Math.min(...durations),
                Math.max(...durations),
              )
        }
        price={
          single
            ? formatMoney(prices[0] ?? 0)
            : formatPriceRange(Math.min(...prices), Math.max(...prices))
        }
      />
    );
  }

  const selection = bookingSelectionSchema.parse({
    serviceIds: state.serviceIds,
    masterId: state.masterId,
    date: state.date,
    time: state.time,
  });
  try {
    const quote = await quoteBooking(
      db,
      selection,
      { phone: null, promoCode: "" },
      now,
    );
    return (
      <ContactsStep
        selection={selection}
        initialQuote={toQuoteView(quote)}
        when={formatSalonVisit(quote.visitAt)}
        countries={countryOptions()}
      />
    );
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return (
      <StepNotice
        message={error.message}
        href={wizardHref({ ...state, step: "time", time: null })}
        label="Выбрать другое время"
      />
    );
  }
}

async function serviceNames(ids: string[]): Promise<string[]> {
  const rows = await db.service.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return ids.flatMap((id) => rows.find((row) => row.id === id)?.name ?? []);
}

function StepNotice({
  message,
  href,
  label,
}: {
  message: string;
  href: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed p-6">
      <p>{message}</p>
      <Button asChild size="lg" className="h-11">
        <Link href={href}>{label}</Link>
      </Button>
    </div>
  );
}

// Сначала страны, откуда обычно звонят клиенты салона, потом — все по алфавиту.
const FIRST = ["RU", "BY", "KZ", "UZ", "KG", "AM", "GE", "AZ", "TJ"];

function countryOptions(): CountryOption[] {
  const names = new Intl.DisplayNames(["ru"], { type: "region" });
  // «Россия +7»: название слева, код справа — список читается по названиям.
  const option = (code: (typeof FIRST)[number]) => ({
    code,
    name: names.of(code) ?? code,
    dialCode: `+${getCountryCallingCode(code as never)}`,
    popular: FIRST.includes(code),
  });
  const rest = getCountries()
    .filter((code) => !FIRST.includes(code))
    .map(option)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return [...FIRST.map(option), ...rest];
}
