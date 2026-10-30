"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { ConfirmAction, FormDialog } from "@/components/forms/dialogs";
import {
  FormSubmit,
  NumberField,
  SelectField,
} from "@/components/forms/fields";
import { submitAction } from "@/components/forms/submit";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { formatMoney, kopecksToRubles } from "@/lib/money";
import {
  PAYMENT_METHODS,
  type PaymentInput,
  paymentSchema,
} from "@/lib/validation/staff-booking";
import { addPayment, removePayment } from "@/server/bookings/staff-actions";
import { PAYMENT_METHOD_LABELS } from "./labels";

export type PaymentRow = {
  id: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string; // «3 ноября в 14:20» — форматирует сервер
};

/** Оплаты визита: внести может и мастер (свои записи), удалить — администратор. */
export function BookingPayments({
  bookingId,
  payments,
  totalPrice,
  canPay, // визит состоялся
  canRemove,
}: {
  bookingId: string;
  payments: PaymentRow[];
  totalPrice: number;
  canPay: boolean;
  canRemove: boolean;
}) {
  const paid = payments.reduce((sum, row) => sum + row.amount, 0);
  const left = Math.max(0, totalPrice - paid);

  return (
    <div className="flex flex-col gap-3">
      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {canPay ? "Оплат пока нет." : "Оплату вносят, когда клиент пришёл."}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {payments.map((payment) => (
            <li key={payment.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium tabular-nums">
                  {formatMoney(payment.amount)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {PAYMENT_METHOD_LABELS[payment.method]} · {payment.paidAt}
                </p>
              </div>
              {canRemove && (
                <ConfirmAction
                  title={`Удалить оплату ${formatMoney(payment.amount)} (${PAYMENT_METHOD_LABELS[payment.method].toLowerCase()})?`}
                  description="Удаляйте только ошибочно внесённую оплату: она пропадёт из выручки."
                  action={() => removePayment(payment.id)}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Удалить оплату ${formatMoney(payment.amount)}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <dl className="grid grid-cols-2 gap-1 text-sm">
        <dt className="text-muted-foreground">Оплачено</dt>
        <dd className="text-right tabular-nums">{formatMoney(paid)}</dd>
        <dt className="text-muted-foreground">Осталось</dt>
        <dd className="text-right font-medium tabular-nums">
          {formatMoney(left)}
        </dd>
      </dl>
      {canPay && left > 0 && (
        <FormDialog
          title="Оплата"
          trigger={
            <Button variant="outline" className="h-11 w-full sm:h-8 sm:w-fit">
              <Plus aria-hidden /> Внести оплату
            </Button>
          }
        >
          {(close) => (
            <PaymentForm bookingId={bookingId} left={left} onDone={close} />
          )}
        </FormDialog>
      )}
    </div>
  );
}

function PaymentForm({
  bookingId,
  left,
  onDone,
}: {
  bookingId: string;
  left: number;
  onDone: () => void;
}) {
  const form = useForm<PaymentInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: kopecksToRubles(left), method: "CARD" },
  });
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const result = await submitAction(form, () =>
          addPayment(bookingId, values),
        );
        if (result?.ok) onDone();
      })}
    >
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            control={form.control}
            name="amount"
            label="Сумма"
            suffix="₽"
            step={0.01}
            description={`Осталось оплатить ${formatMoney(left)}`}
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
        <FormSubmit pending={form.formState.isSubmitting}>Внести</FormSubmit>
      </FieldGroup>
    </form>
  );
}
