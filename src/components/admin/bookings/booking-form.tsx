"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect } from "react";
import {
  type Control,
  Controller,
  type UseFormReturn,
  useForm,
  useWatch,
} from "react-hook-form";
import {
  FormSubmit,
  NumberField,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/forms/fields";
import { submitAction } from "@/components/forms/submit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { formatDiscount, formatMoney } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import {
  type BookingUpdateInput,
  bookingUpdateSchema,
  type SalonDiscountInput,
  STAFF_BOOKING_SOURCES,
  type StaffBookingInput,
  type StaffQuoteInput,
  staffBookingSchema,
  staffQuoteSchema,
} from "@/lib/validation/staff-booking";
import type { StaffQuote } from "@/server/bookings/staff";
import {
  createBooking,
  freeTimes,
  lookupClient,
  quoteBooking,
  quoteUpdate,
  updateBooking,
} from "@/server/bookings/staff-actions";
import type { BookingFormMaster } from "@/server/bookings/staff-queries";
import { DISCOUNT_SOURCE_LABELS, SOURCE_LABELS } from "./labels";
import { useServerValue } from "./use-server-value";

// Ручная запись и перенос (DESIGN.md, 7.3–7.4). Цена и проверка графика считаются на
// сервере тем же кодом, что и при сохранении; форма только показывает результат.

const DISCOUNT_MODES: { value: SalonDiscountInput["mode"]; label: string }[] = [
  { value: "auto", label: "Автоматически: скидка клиента или промокод" },
  { value: "manual", label: "Вручную" },
  { value: "none", label: "Без скидки" },
];

const DISCOUNT_KINDS = [
  { value: "PERCENT", label: "Процент" },
  { value: "AMOUNT", label: "Сумма" },
];

// ── Новая запись ─────────────────────────────────────────────────────────────

export function NewBookingForm({
  masters,
  defaults,
}: {
  masters: BookingFormMaster[];
  defaults: { masterId: string | null; date: string; time: string };
}) {
  const router = useRouter();
  const form = useForm<StaffBookingInput>({
    resolver: zodResolver(staffBookingSchema),
    defaultValues: {
      phone: "",
      name: "",
      masterId: defaults.masterId ?? masters[0]?.id ?? "",
      serviceIds: [],
      date: defaults.date,
      time: defaults.time,
      durationMin: null,
      source: "PHONE",
      comment: "",
      promoCode: "",
      discount: { mode: "auto", kind: "PERCENT", value: null },
      prices: {},
    },
  });
  const values = useWatch({ control: form.control });
  const master = masters.find((row) => row.id === values.masterId);
  const serviceIds = values.serviceIds ?? [];

  // Мастер сменился — услуги, которых у него нет, снимаются.
  useEffect(() => {
    if (!master) return;
    const own = new Set(master.services.map((service) => service.id));
    const current = form.getValues("serviceIds");
    const kept = current.filter((id) => own.has(id));
    if (kept.length !== current.length) form.setValue("serviceIds", kept);
  }, [master, form]);

  const phone = normalizePhone(values.phone ?? "");
  const client = useServerValue(phone, lookupClient, 300);
  useEffect(() => {
    const known = client.data;
    if (known && !form.getValues("name").trim()) {
      form.setValue("name", known.name, { shouldValidate: true });
    }
  }, [client.data, form]);

  const quoteInput = staffQuoteSchema.safeParse(values);
  const quote = useServerValue(
    quoteInput.success ? JSON.stringify(quoteInput.data) : null,
    useCallback(
      (key: string) => quoteBooking(JSON.parse(key) as StaffQuoteInput),
      [],
    ),
  );

  const times = useFreeTimes(
    values.masterId && values.date && serviceIds.length > 0
      ? {
          masterId: values.masterId,
          date: values.date,
          serviceIds,
          durationMin: values.durationMin ?? null,
        }
      : null,
  );

  let clientHint: string | undefined;
  if (client.data) {
    const { name, discountKind, discountValue } = client.data;
    clientHint = `Клиент уже есть: ${name}${
      discountKind && discountValue
        ? ` · постоянная скидка ${formatDiscount(discountKind, discountValue)}`
        : ""
    }`;
  } else if (phone && !client.loading) {
    clientHint = "Новый клиент — карточка появится после записи";
  }

  return (
    <form
      noValidate
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
      onSubmit={form.handleSubmit(async (data) => {
        const result = await submitAction(form, () => createBooking(data));
        if (result?.ok) router.push(`/admin/bookings/${result.data.id}`);
      })}
    >
      <div className="flex flex-col gap-6">
        <Section title="Клиент">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="phone"
              label="Телефон"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="+7 999 123-45-67"
              description={clientHint}
            />
            <TextField
              control={form.control}
              name="name"
              label="Имя"
              autoComplete="off"
            />
          </div>
        </Section>

        <Section title="Мастер и услуги">
          <SelectField
            control={form.control}
            name="masterId"
            label="Мастер"
            options={masters.map((row) => ({ value: row.id, label: row.name }))}
          />
          <ServicePicker control={form.control} master={master} />
        </Section>

        <Section title="Время">
          <VisitTimeFields form={form} times={times} />
          <SelectField
            control={form.control}
            name="source"
            label="Откуда запись"
            options={STAFF_BOOKING_SOURCES.map((value) => ({
              value,
              label: SOURCE_LABELS[value],
            }))}
          />
        </Section>

        <Section title="Скидка и комментарий">
          <DiscountFields
            control={form.control}
            discount={values.discount}
            promoCode
          />
          <TextareaField
            control={form.control}
            name="comment"
            label="Комментарий"
            rows={2}
          />
        </Section>

        <ManualPrices
          control={form.control}
          items={(master?.services ?? [])
            .filter((service) => serviceIds.includes(service.id))
            .map((service) => ({ key: service.id, name: service.name }))}
          quote={quote.data}
        />
      </div>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-4">
        <PriceSummary {...quote} />
        <FormSubmit pending={form.formState.isSubmitting}>
          Создать запись
        </FormSubmit>
      </aside>
    </form>
  );
}

function ServicePicker({
  control,
  master,
}: {
  control: Control<StaffBookingInput>;
  master: BookingFormMaster | undefined;
}) {
  const groups = new Map<string, BookingFormMaster["services"]>();
  for (const service of master?.services ?? []) {
    groups.set(service.category, [
      ...(groups.get(service.category) ?? []),
      service,
    ]);
  }
  return (
    <Controller
      control={control}
      name="serviceIds"
      render={({ field, fieldState }) => (
        <FieldSet data-invalid={fieldState.invalid}>
          <FieldLegend variant="label">Услуги</FieldLegend>
          {groups.size === 0 && (
            <p className="text-sm text-muted-foreground">
              Мастер пока не делает ни одной услуги.
            </p>
          )}
          {[...groups].map(([category, services]) => (
            <div key={category} className="flex flex-col gap-1.5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {category}
              </p>
              {services.map((service) => {
                const checked = field.value.includes(service.id);
                return (
                  <label
                    key={service.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors has-data-checked:border-primary has-data-checked:bg-primary/5"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) =>
                        field.onChange(
                          next
                            ? [...field.value, service.id]
                            : field.value.filter((id) => id !== service.id),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      {service.name}
                      <span className="text-muted-foreground">
                        {" "}
                        · {service.durationMin} мин
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(service.price)}
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </FieldSet>
      )}
    />
  );
}

// ── Перенос и правка ─────────────────────────────────────────────────────────

export type EditBookingDefaults = BookingUpdateInput & {
  items: { key: string; name: string }[]; // ключ — BookingItem.id
  promoCode: string | null; // промокод записи: при «автоматически» он сохраняется
};

export function EditBookingForm({
  bookingId,
  masters,
  defaults,
  onDone,
}: {
  bookingId: string;
  masters: { id: string; name: string }[];
  defaults: EditBookingDefaults;
  onDone: () => void;
}) {
  const { items, promoCode, ...initial } = defaults;
  const form = useForm<BookingUpdateInput>({
    resolver: zodResolver(bookingUpdateSchema),
    defaultValues: initial,
  });
  const values = useWatch({ control: form.control });

  const parsed = bookingUpdateSchema.safeParse(values);
  const quote = useServerValue(
    parsed.success ? JSON.stringify(parsed.data) : null,
    useCallback(
      (key: string) =>
        quoteUpdate(bookingId, JSON.parse(key) as BookingUpdateInput),
      [bookingId],
    ),
  );
  const times = useFreeTimes(
    values.masterId && values.date
      ? {
          masterId: values.masterId,
          date: values.date,
          bookingId,
          durationMin: values.durationMin ?? null,
        }
      : null,
  );

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (data) => {
        const result = await submitAction(form, () =>
          updateBooking(bookingId, data),
        );
        if (result?.ok) onDone();
      })}
    >
      <FieldGroup>
        <SelectField
          control={form.control}
          name="masterId"
          label="Мастер"
          description="У другого мастера цены услуг пересчитаются по его прайсу, кроме заданных вручную."
          options={masters.map((row) => ({ value: row.id, label: row.name }))}
        />
        <VisitTimeFields form={form} times={times} />
        <DiscountFields control={form.control} discount={values.discount} />
        {promoCode && values.discount?.mode === "auto" && (
          <p className="-mt-3 text-sm text-muted-foreground">
            Промокод записи {promoCode} учитывается.
          </p>
        )}
        <ManualPrices
          control={form.control}
          items={items}
          quote={quote.data}
          open={
            initial.durationMin !== null ||
            Object.values(initial.prices).some((price) => price !== null)
          }
        />
        <PriceSummary {...quote} />
        <FormSubmit pending={form.formState.isSubmitting}>Сохранить</FormSubmit>
      </FieldGroup>
    </form>
  );
}

// ── Общие части ──────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

type FreeTimesQuery = {
  masterId: string;
  date: string;
  serviceIds?: string[];
  bookingId?: string;
  durationMin: number | null;
};

function useFreeTimes(query: FreeTimesQuery | null) {
  return useServerValue(
    query ? JSON.stringify(query) : null,
    useCallback(
      (key: string) => freeTimes(JSON.parse(key) as FreeTimesQuery),
      [],
    ),
    250,
  );
}

type VisitFields = { date: string; time: string; durationMin: number | null };

/** Дата, время и подсказки свободного времени мастера. */
function VisitTimeFields<T extends VisitFields>({
  form,
  times,
}: {
  form: UseFormReturn<T>;
  times: { data: string[] | null; loading: boolean; error: string | null };
}) {
  // Обе формы содержат эти поля; React Hook Form не выводит это из дженерика.
  const visit = form as unknown as UseFormReturn<VisitFields>;
  const time = useWatch({ control: visit.control, name: "time" });
  const free = times.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-4">
        <TextField
          control={visit.control}
          name="date"
          label="Дата"
          type="date"
        />
        <TextField
          control={visit.control}
          name="time"
          label="Время"
          type="time"
          step={300}
        />
      </div>
      <div className="flex flex-col gap-2" aria-live="polite">
        <p className="text-sm text-muted-foreground">
          {times.data === null
            ? "Выберите мастера и услуги — покажем свободное время."
            : free.length === 0
              ? times.loading
                ? "Ищем свободное время…"
                : "Свободного времени в этот день нет. Время можно указать вручную, если мастер согласен."
              : "Свободно у мастера:"}
        </p>
        {free.length > 0 && (
          <div
            className={cn(
              "flex max-h-40 flex-wrap gap-1.5 overflow-y-auto",
              times.loading && "opacity-60",
            )}
          >
            {free.map((slot) => (
              <Button
                key={slot}
                type="button"
                size="sm"
                variant={slot === time ? "default" : "outline"}
                aria-pressed={slot === time}
                className="h-9 px-3 tabular-nums sm:h-7"
                onClick={() =>
                  visit.setValue("time", slot, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                {slot}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type DiscountForm = { discount: SalonDiscountInput; promoCode?: string };

function DiscountFields<T extends DiscountForm>({
  control,
  discount,
  promoCode = false,
}: {
  control: Control<T>;
  discount: Partial<SalonDiscountInput> | undefined;
  promoCode?: boolean;
}) {
  const own = control as unknown as Control<DiscountForm>;
  return (
    <div className="flex flex-col gap-4">
      <SelectField
        control={own}
        name="discount.mode"
        label="Скидка салона"
        options={DISCOUNT_MODES}
      />
      {discount?.mode === "auto" && promoCode && (
        <TextField
          control={own}
          name="promoCode"
          label="Промокод"
          autoComplete="off"
          className="uppercase"
          description="Из промокода и постоянной скидки клиента применяется большая."
        />
      )}
      {discount?.mode === "manual" && (
        <div className="grid grid-cols-2 gap-4">
          <SelectField
            control={own}
            name="discount.kind"
            label="Вид"
            options={DISCOUNT_KINDS}
          />
          <NumberField
            control={own}
            name="discount.value"
            label="Размер"
            suffix={discount.kind === "AMOUNT" ? "₽" : "%"}
            step={discount.kind === "AMOUNT" ? 0.01 : 1}
            nullable
          />
        </div>
      )}
    </div>
  );
}

type PricesForm = {
  durationMin: number | null;
  prices: Record<string, number | null | undefined>;
};

/** Ручные цены услуг и длительность — свёрнуты, пока не нужны. */
function ManualPrices<T extends PricesForm>({
  control,
  items,
  quote,
  open = false,
}: {
  control: Control<T>;
  items: { key: string; name: string }[];
  quote: StaffQuote | null;
  open?: boolean;
}) {
  const own = control as unknown as Control<PricesForm>;
  const calculated = new Map(
    (quote?.items ?? [])
      .filter((item) => !item.isPriceManual)
      .map((item) => [item.key, item.price]),
  );
  return (
    <details
      open={open}
      className="group rounded-lg border bg-card p-4 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 font-medium">
        Цены вручную и длительность
        <span className="text-sm text-muted-foreground group-open:hidden">
          показать
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Пустое поле — как по прайсу мастера с его акциями.
        </p>
        <NumberField
          control={own}
          name="durationMin"
          label="Длительность"
          suffix="мин"
          step={5}
          nullable
          placeholder={
            quote ? `по услугам — ${quote.servicesDurationMin}` : undefined
          }
        />
        {items.map((item) => {
          const price = calculated.get(item.key);
          return (
            <NumberField
              key={item.key}
              control={own}
              name={`prices.${item.key}`}
              label={`Цена: ${item.name}`}
              suffix="₽"
              step={0.01}
              nullable
              placeholder={
                price === undefined ? undefined : String(price / 100)
              }
            />
          );
        })}
      </div>
    </details>
  );
}

function PriceSummary({
  data: quote,
  error,
  loading,
}: {
  data: StaffQuote | null;
  error: string | null;
  loading: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 transition-opacity",
        loading && quote && "opacity-60",
      )}
      aria-live="polite"
      aria-busy={loading}
    >
      <h2 className="font-display text-lg font-semibold">Итог</h2>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!quote && !error && (
        <p className="text-sm text-muted-foreground">
          Выберите мастера, услуги и время — здесь появится цена.
        </p>
      )}
      {quote && (
        <>
          <ul className="flex flex-col gap-1 text-sm">
            {quote.items.map((item) => (
              <li key={item.key} className="flex justify-between gap-3">
                <span className="min-w-0">
                  {item.name}
                  {item.isPriceManual && (
                    <span className="text-muted-foreground"> · вручную</span>
                  )}
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  {item.masterDiscount > 0 && (
                    <s className="mr-1.5 text-muted-foreground">
                      {formatMoney(item.basePrice)}
                    </s>
                  )}
                  {formatMoney(item.price)}
                </span>
              </li>
            ))}
          </ul>
          {quote.salonDiscount > 0 && quote.salonDiscountSource && (
            <p className="flex justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                Скидка: {DISCOUNT_SOURCE_LABELS[quote.salonDiscountSource]}
              </span>
              <span className="tabular-nums">
                −{formatMoney(quote.salonDiscount)}
              </span>
            </p>
          )}
          {quote.promoCodeIssue && (
            <p className="text-sm text-muted-foreground">
              {quote.promoCodeIssue}
            </p>
          )}
          <p className="flex items-baseline justify-between gap-3 border-t pt-3">
            <span>
              Итого
              <span className="text-sm text-muted-foreground">
                {" "}
                · {quote.durationMin} мин
              </span>
            </span>
            <span className="text-2xl font-semibold tabular-nums">
              {formatMoney(quote.totalPrice)}
            </span>
          </p>
          {quote.overlaps && (
            <p className="flex gap-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Пересекается с другой записью мастера (с учётом уборки). Выберите
              другое время или сократите длительность.
            </p>
          )}
          {!quote.overlaps && !quote.fitsSchedule && (
            <p className="flex gap-2 rounded-md bg-amber-100 p-2 text-sm text-amber-950 dark:bg-amber-400/15 dark:text-amber-100">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Вне графика мастера или в его отсутствие. Записать можно, если
              мастер согласен.
            </p>
          )}
        </>
      )}
    </div>
  );
}
