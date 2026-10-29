"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { PageHeader } from "@/components/admin/page-header";
import { ConfirmAction, FormDialog } from "@/components/forms/dialogs";
import {
  FormSubmit,
  NumberField,
  SelectField,
  SwitchField,
  TextField,
} from "@/components/forms/fields";
import { submitAction } from "@/components/forms/submit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  type PromoCodeInput,
  promoCodeSchema,
} from "@/lib/validation/promo-codes";
import { removePromoCode, savePromoCode } from "@/server/promo-codes/actions";

export type PromoCodeStatus =
  "active" | "scheduled" | "ended" | "exhausted" | "off";

export type PromoCodeItem = {
  id: string;
  code: string;
  discount: string;
  period: string;
  uses: string; // «12» или «12 из 100»
  status: PromoCodeStatus;
  form: PromoCodeInput;
};

const STATUS: Record<
  PromoCodeStatus,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  active: { label: "Действует", variant: "default" },
  scheduled: { label: "Запланирован", variant: "outline" },
  ended: { label: "Истёк", variant: "secondary" },
  exhausted: { label: "Лимит исчерпан", variant: "secondary" },
  off: { label: "Выключен", variant: "secondary" },
};

export function PromoCodesView({ codes }: { codes: PromoCodeItem[] }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Промокоды"
        description="Скидка салона на всю запись. Не уменьшает выручку мастера. Из промокода и постоянной скидки клиента применяется большая."
        actions={
          <FormDialog
            title="Новый промокод"
            trigger={
              <Button>
                <Plus aria-hidden /> Промокод
              </Button>
            }
          >
            {(close) => <PromoCodeForm onDone={close} />}
          </FormDialog>
        }
      />

      {codes.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-muted-foreground">
          Промокодов пока нет.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {codes.map((code) => (
            <li key={code.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                {/* Неработающий код приглушён, чтобы при беглом просмотре не спутать его с действующим. */}
                <div
                  className={cn(
                    "flex flex-wrap items-center gap-2",
                    code.status !== "active" && "text-muted-foreground",
                  )}
                >
                  <span className="font-mono font-medium">{code.code}</span>
                  <span className="font-medium">{code.discount}</span>
                  <Badge variant={STATUS[code.status].variant}>
                    {STATUS[code.status].label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Использовано: {code.uses}
                </p>
                <p className="text-sm text-muted-foreground">
                  Срок: {code.period}
                </p>
              </div>
              <FormDialog
                title={`Промокод ${code.code}`}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Изменить промокод ${code.code}`}
                  >
                    <Pencil aria-hidden />
                  </Button>
                }
              >
                {(close) => <PromoCodeForm code={code} onDone={close} />}
              </FormDialog>
              <ConfirmAction
                title={`Удалить промокод ${code.code}?`}
                description="Удалить можно только промокод, которым ещё не пользовались. Использованный лучше выключить."
                action={() => removePromoCode(code.id)}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Удалить промокод ${code.code}`}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PromoCodeForm({
  code,
  onDone,
}: {
  code?: PromoCodeItem;
  onDone: () => void;
}) {
  const form = useForm<PromoCodeInput>({
    resolver: zodResolver(promoCodeSchema),
    defaultValues: code?.form ?? {
      code: "",
      kind: "PERCENT",
      value: 10,
      validFrom: "",
      validUntil: "",
      maxUses: null,
      isActive: true,
    },
  });
  const kind = useWatch({ control: form.control, name: "kind" });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const result = await submitAction(form, () =>
          savePromoCode(code?.id ?? null, values),
        );
        if (result?.ok) onDone();
      })}
    >
      <FieldGroup>
        <TextField
          control={form.control}
          name="code"
          label="Код"
          placeholder="WELCOME10"
          autoCapitalize="characters"
          description="Латинские буквы и цифры. Клиент вводит его при записи, регистр не важен."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="kind"
            label="Тип скидки"
            options={[
              { value: "PERCENT", label: "Процент" },
              { value: "AMOUNT", label: "Сумма в рублях" },
            ]}
          />
          <NumberField
            control={form.control}
            name="value"
            label="Размер"
            suffix={kind === "PERCENT" ? "%" : "₽"}
            step={kind === "PERCENT" ? 1 : 0.01}
          />
          <TextField
            control={form.control}
            name="validFrom"
            label="Действует с"
            type="date"
          />
          <TextField
            control={form.control}
            name="validUntil"
            label="по (включительно)"
            type="date"
          />
          <NumberField
            control={form.control}
            name="maxUses"
            label="Лимит использований"
            nullable
            placeholder="Без лимита"
          />
        </div>
        <SwitchField control={form.control} name="isActive" label="Включён" />
        <FormSubmit pending={form.formState.isSubmitting}>Сохранить</FormSubmit>
      </FieldGroup>
    </form>
  );
}
