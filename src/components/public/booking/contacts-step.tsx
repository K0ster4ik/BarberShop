"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { TextareaField, TextField } from "@/components/forms/fields";
import { runWithToast, submitAction } from "@/components/forms/submit";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import { type CountryCode, DEFAULT_COUNTRY, normalizePhone } from "@/lib/phone";
import {
  type BookingContacts,
  type BookingSelection,
  bookingContactsSchema,
} from "@/lib/validation/booking";
import type { QuoteView } from "@/server/bookings/quote-view";
import { getBookingQuote, submitBooking } from "@/server/bookings/site-actions";
import { BookingFrame } from "./frame";
import { PriceBreakdown } from "./price-breakdown";
import { SelectionSummary } from "./selection-summary";
import { wizardHref } from "./wizard-state";

export type CountryOption = { code: string; label: string };

const FORM_ID = "booking-contacts";

/** Шаг 4: контакты, промокод, согласие и итоговая цена — сразу запись. */
export function ContactsStep({
  selection,
  initialQuote,
  when,
  duration,
  countries,
}: {
  selection: BookingSelection;
  initialQuote: QuoteView;
  when: string;
  duration: string;
  countries: CountryOption[];
}) {
  const [quote, setQuote] = useState(initialQuote);
  // Что изменилось, пока клиент заполнял форму: цена или (для «любого») мастер.
  const [changeNotice, setChangeNotice] = useState<string | null>(null);
  const [quoting, startQuote] = useTransition();
  const quotedFor = useRef({ phone: "", promoCode: "" });
  const phoneId = useId();
  const promoId = useId();
  const consentId = useId();

  const form = useForm<BookingContacts>({
    resolver: zodResolver(bookingContactsSchema),
    defaultValues: {
      name: "",
      country: DEFAULT_COUNTRY,
      phone: "",
      comment: "",
      promoCode: "",
      consent: false,
    },
  });

  /** Пересчёт цены: постоянная скидка по телефону и промокод. */
  function requote(promoCode: string) {
    const { phone, country } = form.getValues();
    const e164 = normalizePhone(phone, country as CountryCode) ?? "";
    startQuote(async () => {
      const result = await runWithToast(() =>
        getBookingQuote({ ...selection, country, phone: e164, promoCode }),
      );
      if (result?.ok) {
        setQuote(result.data);
        quotedFor.current = { phone: e164, promoCode };
        form.clearErrors("promoCode");
      } else if (result?.fieldErrors?.promoCode) {
        form.setError("promoCode", { message: result.fieldErrors.promoCode });
      }
    });
  }

  function onPhoneBlur() {
    const { phone, country } = form.getValues();
    const e164 = normalizePhone(phone, country as CountryCode);
    if (e164 && e164 !== quotedFor.current.phone) {
      requote(quotedFor.current.promoCode);
    }
  }

  async function send(values: BookingContacts, website: string) {
    const result = await submitAction(form, () =>
      submitBooking({
        ...selection,
        ...values,
        website,
        expectedTotal: quote.totalPrice,
      }),
    );
    const fresh = result?.ok ? result.data.priceChanged : null;
    if (fresh) {
      setChangeNotice(
        fresh.master.id === quote.master.id
          ? `Пока вы заполняли форму, цена изменилась: теперь ${formatMoney(fresh.totalPrice)}.`
          : `Пока вы заполняли форму, это время заняли у мастера ${quote.master.name}. Свободен ${fresh.master.name}, цена — ${formatMoney(fresh.totalPrice)}.`,
      );
      setQuote(fresh);
    }
  }
  const sending = form.formState.isSubmitting;

  const action = (
    <Button
      type="submit"
      form={FORM_ID}
      size="lg"
      className="h-11 shrink-0"
      disabled={sending || quoting}
    >
      {sending && <Loader2 className="animate-spin" aria-hidden />}
      {sending ? "Записываем…" : "Записаться"}
    </Button>
  );

  return (
    <BookingFrame
      summary={
        <SelectionSummary
          services={quote.items.map((item) => item.name)}
          duration={duration}
          master={quote.master}
          when={when}
          price={<PriceBreakdown quote={quote} />}
        />
      }
      barSummary={
        <>
          <p className="text-base font-semibold tabular-nums">
            {formatMoney(quote.totalPrice)}
          </p>
          <p className="truncate text-muted-foreground">{when}</p>
        </>
      }
      action={action}
    >
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5 lg:hidden">
        <SelectionSummary
          services={[]}
          master={quote.master}
          when={when}
          duration={duration}
        />
        <PriceBreakdown quote={quote} />
      </section>

      {changeNotice && (
        <Alert>
          <AlertDescription>
            {changeNotice} Проверьте и нажмите «Записаться» ещё раз.
          </AlertDescription>
        </Alert>
      )}

      <form
        id={FORM_ID}
        noValidate
        onSubmit={(event) => {
          // Ловушка для ботов читается из самой формы в момент отправки.
          const website = String(
            new FormData(event.currentTarget).get("website") ?? "",
          );
          void form.handleSubmit((values) => send(values, website))(event);
        }}
        className="rounded-xl border bg-card p-4 sm:p-5"
      >
        <FieldGroup>
          <TextField
            control={form.control}
            name="name"
            label="Имя"
            autoComplete="name"
            className="h-11"
          />

          <Field data-invalid={!!form.formState.errors.phone}>
            <FieldLabel htmlFor={phoneId}>Телефон</FieldLabel>
            <div className="flex gap-2">
              <Controller
                control={form.control}
                name="country"
                render={({ field }) => (
                  <select
                    {...field}
                    aria-label="Страна"
                    onChange={(event) => {
                      field.onChange(event);
                      onPhoneBlur();
                    }}
                    className="h-11 w-28 shrink-0 rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                  >
                    {countries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.label}
                      </option>
                    ))}
                  </select>
                )}
              />
              <Controller
                control={form.control}
                name="phone"
                render={({ field, fieldState }) => (
                  <Input
                    {...field}
                    id={phoneId}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="999 123-45-67"
                    className="h-11"
                    aria-invalid={fieldState.invalid}
                    onBlur={() => {
                      field.onBlur();
                      onPhoneBlur();
                    }}
                  />
                )}
              />
            </div>
            <FieldDescription>
              Понадобится, только если что-то изменится. Можно ввести номер
              любой страны, начиная с «+».
            </FieldDescription>
            {form.formState.errors.phone && (
              <FieldError errors={[form.formState.errors.phone]} />
            )}
          </Field>

          <Field data-invalid={!!form.formState.errors.promoCode}>
            <FieldLabel htmlFor={promoId}>Промокод</FieldLabel>
            <div className="flex gap-2">
              <Controller
                control={form.control}
                name="promoCode"
                render={({ field, fieldState }) => (
                  <Input
                    {...field}
                    id={promoId}
                    autoComplete="off"
                    autoCapitalize="characters"
                    className="h-11 uppercase"
                    aria-invalid={fieldState.invalid}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        requote(field.value.trim().toUpperCase());
                      }
                    }}
                  />
                )}
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0"
                disabled={quoting}
                onClick={() =>
                  requote(form.getValues("promoCode").trim().toUpperCase())
                }
              >
                Применить
              </Button>
            </div>
            {form.formState.errors.promoCode ? (
              <FieldError errors={[form.formState.errors.promoCode]} />
            ) : (
              quote.promoCode && (
                <FieldDescription
                  className={
                    quote.promoCode.applied ? "text-primary" : undefined
                  }
                >
                  {quote.promoCode.message}
                </FieldDescription>
              )
            )}
          </Field>

          <TextareaField
            control={form.control}
            name="comment"
            label="Комментарий"
            description="Необязательно. Например, «подровнять бороду покороче»."
          />

          <Controller
            control={form.control}
            name="consent"
            render={({ field, fieldState }) => (
              <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                <Checkbox
                  id={consentId}
                  checked={field.value}
                  onCheckedChange={(checked) =>
                    field.onChange(checked === true)
                  }
                  aria-invalid={fieldState.invalid}
                />
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor={consentId} className="font-normal">
                    Согласен на обработку персональных данных
                  </FieldLabel>
                  <FieldDescription>
                    <Link href="/privacy" target="_blank" className="underline">
                      Как мы обращаемся с данными
                    </Link>
                  </FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </div>
              </Field>
            )}
          />

          {/* Ловушка для ботов: человек это поле не видит и не заполняет. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            className="sr-only"
          />
        </FieldGroup>
      </form>

      <Button asChild variant="ghost" className="h-11 self-start">
        <Link
          href={wizardHref({
            step: "time",
            serviceIds: selection.serviceIds,
            masterId: selection.masterId,
            date: selection.date,
            time: selection.time,
          })}
        >
          <ArrowLeft aria-hidden /> Изменить время
        </Link>
      </Button>
    </BookingFrame>
  );
}
