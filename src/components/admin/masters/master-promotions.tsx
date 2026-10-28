"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
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
import { type PromotionInput, promotionSchema } from "@/lib/validation/masters";
import { removePromotion, savePromotion } from "@/server/masters/actions";
import { MetaLine } from "@/components/admin/meta-line";

export type PromotionStatus = "active" | "scheduled" | "ended" | "off";

export type PromotionItem = {
  id: string;
  title: string;
  scope: string; // «Все услуги» или название услуги
  discount: string; // «−20%»
  period: string; // «с 1 ноября 2026 г. по 30 ноября 2026 г.» или «Бессрочно»
  status: PromotionStatus;
  form: PromotionInput;
};

const STATUS: Record<
  PromotionStatus,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  active: { label: "Действует", variant: "default" },
  scheduled: { label: "Запланирована", variant: "outline" },
  ended: { label: "Закончилась", variant: "secondary" },
  off: { label: "Выключена", variant: "secondary" },
};

export function MasterPromotions({
  masterId,
  promotions,
  serviceOptions,
}: {
  masterId: string;
  promotions: PromotionItem[];
  serviceOptions: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Скидка мастера уменьшает цену услуги и его выручку. Если подходит
          несколько акций, клиент получает самую выгодную.
        </p>
        <FormDialog
          title="Новая акция"
          trigger={
            <Button>
              <Plus aria-hidden /> Акция
            </Button>
          }
        >
          {(close) => (
            <PromotionForm
              masterId={masterId}
              serviceOptions={serviceOptions}
              onDone={close}
            />
          )}
        </FormDialog>
      </div>

      {promotions.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-muted-foreground">
          Акций пока нет.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {promotions.map((promotion) => (
            <li key={promotion.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{promotion.title}</span>
                  <Badge variant={STATUS[promotion.status].variant}>
                    {STATUS[promotion.status].label}
                  </Badge>
                </div>
                <MetaLine parts={[promotion.discount, promotion.scope]} />
                <p className="text-sm text-muted-foreground">
                  Срок: {promotion.period}
                </p>
              </div>
              <FormDialog
                title="Акция"
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Изменить акцию «${promotion.title}»`}
                  >
                    <Pencil aria-hidden />
                  </Button>
                }
              >
                {(close) => (
                  <PromotionForm
                    masterId={masterId}
                    promotion={promotion}
                    serviceOptions={serviceOptions}
                    onDone={close}
                  />
                )}
              </FormDialog>
              <ConfirmAction
                title={`Удалить акцию «${promotion.title}»?`}
                description="В уже созданных записях скидка сохранится."
                action={() => removePromotion(promotion.id)}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Удалить акцию «${promotion.title}»`}
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

function PromotionForm({
  masterId,
  promotion,
  serviceOptions,
  onDone,
}: {
  masterId: string;
  promotion?: PromotionItem;
  serviceOptions: { value: string; label: string }[];
  onDone: () => void;
}) {
  const form = useForm<PromotionInput>({
    resolver: zodResolver(promotionSchema),
    defaultValues: promotion?.form ?? {
      title: "",
      serviceId: "",
      kind: "PERCENT",
      value: 10,
      validFrom: "",
      validUntil: "",
      isActive: true,
    },
  });
  const kind = useWatch({ control: form.control, name: "kind" });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const result = await submitAction(form, () =>
          savePromotion(masterId, promotion?.id ?? null, values),
        );
        if (result?.ok) onDone();
      })}
    >
      <FieldGroup>
        <TextField
          control={form.control}
          name="title"
          label="Название"
          placeholder="−20% на бороду по будням"
          description="Клиенты увидят его рядом с ценой."
        />
        <SelectField
          control={form.control}
          name="serviceId"
          label="На что действует"
          options={[
            { value: "", label: "Все услуги мастера" },
            ...serviceOptions,
          ]}
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
            description="Пустые даты — без ограничения."
          />
        </div>
        <SwitchField control={form.control} name="isActive" label="Включена" />
        <FormSubmit pending={form.formState.isSubmitting}>Сохранить</FormSubmit>
      </FieldGroup>
    </form>
  );
}
