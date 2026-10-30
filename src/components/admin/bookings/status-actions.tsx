"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { ConfirmAction, FormDialog } from "@/components/forms/dialogs";
import {
  FormSubmit,
  NumberField,
  SelectField,
  SwitchField,
} from "@/components/forms/fields";
import { runWithToast, submitAction } from "@/components/forms/submit";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import type { BookingStatus } from "@/generated/prisma/enums";
import { formatMoney, kopecksToRubles } from "@/lib/money";
import { cn } from "@/lib/utils";
import { PAYMENT_METHODS, paymentSchema } from "@/lib/validation/staff-booking";
import { changeStatus } from "@/server/bookings/staff-actions";
import { PAYMENT_METHOD_LABELS, STATUS_ACTIONS } from "./labels";

// Смена статуса (DESIGN.md, 7.6). Какие переходы доступны, решает сервер (nextStatuses),
// и он же проверяет их ещё раз при нажатии.

// На телефоне кнопки высотой 44px: мастер нажимает их пальцем между клиентами.
const TOUCH = "h-11 sm:h-8";

export function StatusActions({
  bookingId,
  allowed,
  totalPrice,
  fromWebsite,
  cancelLabel = STATUS_ACTIONS.CANCELLED,
  className,
}: {
  bookingId: string;
  allowed: BookingStatus[];
  totalPrice: number;
  fromWebsite: boolean;
  cancelLabel?: string; // у заявки с сайта — «Отклонить»
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  if (allowed.length === 0) return null;
  const run = (to: BookingStatus) => () =>
    changeStatus(bookingId, { to, payment: null });

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {allowed.includes("CONFIRMED") && (
        <Button
          className={TOUCH}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await runWithToast(run("CONFIRMED"));
            })
          }
        >
          {STATUS_ACTIONS.CONFIRMED}
        </Button>
      )}
      {allowed.includes("COMPLETED") && (
        <FormDialog
          title="Клиент пришёл"
          description="Отметьте визит и сразу внесите оплату — или внесите её позже в карточке записи."
          trigger={
            <Button
              className={TOUCH}
              variant={allowed.includes("CONFIRMED") ? "outline" : "default"}
            >
              {STATUS_ACTIONS.COMPLETED}
            </Button>
          }
        >
          {(close) => (
            <CompleteForm
              bookingId={bookingId}
              totalPrice={totalPrice}
              onDone={close}
            />
          )}
        </FormDialog>
      )}
      {allowed.includes("NO_SHOW") && (
        <ConfirmAction
          title="Клиент не пришёл?"
          description="Визит отметится как неявка — это видно в карточке клиента."
          confirmLabel="Не пришёл"
          action={run("NO_SHOW")}
          trigger={
            <Button className={TOUCH} variant="outline">
              {STATUS_ACTIONS.NO_SHOW}
            </Button>
          }
        />
      )}
      {allowed.includes("CANCELLED") && (
        <ConfirmAction
          title="Отменить запись?"
          description={
            fromWebsite
              ? "Время мастера освободится, а в Telegram-канал салона уйдёт сообщение об отмене."
              : "Время мастера освободится. Отменённую запись нельзя вернуть."
          }
          confirmLabel="Отменить запись"
          action={run("CANCELLED")}
          trigger={
            <Button className={TOUCH} variant="outline">
              {cancelLabel}
            </Button>
          }
        />
      )}
    </div>
  );
}

const completeSchema = z
  .object({
    pay: z.boolean(),
    amount: z.number().nullable(),
    method: z.enum(PAYMENT_METHODS),
  })
  .superRefine((input, ctx) => {
    if (!input.pay) return;
    const parsed = paymentSchema.safeParse({
      amount: input.amount ?? Number.NaN,
      method: input.method,
    });
    for (const issue of parsed.error?.issues ?? []) {
      ctx.addIssue({
        code: "custom",
        path: issue.path,
        message: issue.message,
      });
    }
  });
type CompleteInput = z.infer<typeof completeSchema>;

function CompleteForm({
  bookingId,
  totalPrice,
  onDone,
}: {
  bookingId: string;
  totalPrice: number;
  onDone: () => void;
}) {
  const form = useForm<CompleteInput>({
    resolver: zodResolver(completeSchema),
    defaultValues: {
      pay: totalPrice > 0,
      amount: kopecksToRubles(totalPrice),
      method: "CARD",
    },
  });
  const pay = useWatch({ control: form.control, name: "pay" });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const result = await submitAction(form, () =>
          changeStatus(bookingId, {
            to: "COMPLETED",
            payment:
              values.pay && values.amount !== null
                ? { amount: values.amount, method: values.method }
                : null,
          }),
        );
        if (result?.ok) onDone();
      })}
    >
      <FieldGroup>
        <SwitchField
          control={form.control}
          name="pay"
          label="Внести оплату сейчас"
          description={`Итог записи — ${formatMoney(totalPrice)}`}
        />
        {pay && (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              control={form.control}
              name="amount"
              label="Сумма"
              suffix="₽"
              step={0.01}
              nullable
            />
            <SelectField
              control={form.control}
              name="method"
              label="Способ"
              options={PAYMENT_METHODS.map((value) => ({
                value,
                label: PAYMENT_METHOD_LABELS[value],
              }))}
            />
          </div>
        )}
        <FormSubmit pending={form.formState.isSubmitting}>
          Отметить визит
        </FormSubmit>
      </FieldGroup>
    </form>
  );
}
