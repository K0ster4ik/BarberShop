"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { ConfirmAction, FormDialog } from "@/components/forms/dialogs";
import {
  FormSubmit,
  NumberField,
  SelectField,
} from "@/components/forms/fields";
import { submitAction } from "@/components/forms/submit";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { formatMoney, kopecksToRubles } from "@/lib/money";
import {
  type MasterServiceInput,
  masterServiceSchema,
} from "@/lib/validation/masters";
import {
  deleteMasterService,
  saveMasterService,
} from "@/server/masters/actions";
import { MetaLine } from "@/components/admin/meta-line";

export type OfferedService = {
  serviceId: string;
  name: string;
  category: string;
  price: number;
  durationMin: number;
  defaultPrice: number;
  defaultDurationMin: number;
  isActive: boolean;
};

export type ServiceOption = {
  id: string;
  name: string;
  category: string;
  price: number;
  durationMin: number;
};

export function MasterServices({
  masterId,
  offered,
  options,
}: {
  masterId: string;
  offered: OfferedService[];
  options: ServiceOption[];
}) {
  const available = options.filter(
    (option) => !offered.some((service) => service.serviceId === option.id),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Цена и длительность у мастера свои. Изменения не трогают уже созданные
          записи.
        </p>
        <FormDialog
          title="Добавить услугу"
          trigger={
            <Button disabled={available.length === 0}>
              <Plus aria-hidden /> Услуга
            </Button>
          }
        >
          {(close) => (
            <MasterServiceForm
              masterId={masterId}
              options={available}
              onDone={close}
            />
          )}
        </FormDialog>
      </div>

      {offered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-muted-foreground">
          Мастер пока не оказывает ни одной услуги.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {offered.map((service) => (
            <li key={service.serviceId} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {service.name}
                  {!service.isActive && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      (скрыта в прайсе)
                    </span>
                  )}
                </p>
                <MetaLine
                  parts={[
                    service.category,
                    `${service.durationMin} мин`,
                    service.price !== service.defaultPrice &&
                      `в прайсе ${formatMoney(service.defaultPrice)}`,
                  ]}
                />
              </div>
              <span className="shrink-0 tabular-nums">
                {formatMoney(service.price)}
              </span>
              <FormDialog
                title={service.name}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Изменить цену: ${service.name}`}
                  >
                    <Pencil aria-hidden />
                  </Button>
                }
              >
                {(close) => (
                  <MasterServiceForm
                    masterId={masterId}
                    existing={service}
                    onDone={close}
                  />
                )}
              </FormDialog>
              <ConfirmAction
                title={`Убрать «${service.name}»?`}
                description="Клиенты больше не смогут записаться к мастеру на эту услугу. Прошлые записи не изменятся."
                confirmLabel="Убрать"
                action={() => deleteMasterService(masterId, service.serviceId)}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Убрать услугу: ${service.name}`}
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

function MasterServiceForm({
  masterId,
  existing,
  options = [],
  onDone,
}: {
  masterId: string;
  existing?: OfferedService;
  options?: ServiceOption[];
  onDone: () => void;
}) {
  const first = options[0];
  const form = useForm<MasterServiceInput>({
    resolver: zodResolver(masterServiceSchema),
    defaultValues: existing
      ? {
          serviceId: existing.serviceId,
          priceRub: kopecksToRubles(existing.price),
          durationMin: existing.durationMin,
        }
      : {
          serviceId: first?.id ?? "",
          priceRub: first ? kopecksToRubles(first.price) : 0,
          durationMin: first?.durationMin ?? 60,
        },
  });

  // Выбор услуги подставляет её цену и длительность из прайса как отправную точку.
  const serviceId = useWatch({ control: form.control, name: "serviceId" });
  useEffect(() => {
    if (existing) return;
    const option = options.find((o) => o.id === serviceId);
    if (!option) return;
    form.setValue("priceRub", kopecksToRubles(option.price));
    form.setValue("durationMin", option.durationMin);
  }, [form, existing, options, serviceId]);

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const result = await submitAction(form, () =>
          saveMasterService(masterId, values),
        );
        if (result?.ok) onDone();
      })}
    >
      <FieldGroup>
        {!existing && (
          <SelectField
            control={form.control}
            name="serviceId"
            label="Услуга"
            options={options.map((option) => ({
              value: option.id,
              label: `${option.name} · ${option.category}`,
            }))}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            control={form.control}
            name="priceRub"
            label="Цена"
            suffix="₽"
            step={0.01}
          />
          <NumberField
            control={form.control}
            name="durationMin"
            label="Длительность"
            suffix="мин"
            step={5}
          />
        </div>
        <FormSubmit pending={form.formState.isSubmitting}>Сохранить</FormSubmit>
      </FieldGroup>
    </form>
  );
}
