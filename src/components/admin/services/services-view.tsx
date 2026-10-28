"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { PageHeader } from "@/components/admin/page-header";
import { ConfirmAction, FormDialog } from "@/components/forms/dialogs";
import {
  NumberField,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
} from "@/components/forms/fields";
import { submitAction } from "@/components/forms/submit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { formatMoney, kopecksToRubles } from "@/lib/money";
import { plural } from "@/lib/plural";
import {
  type CategoryInput,
  categorySchema,
  type ServiceInput,
  serviceSchema,
} from "@/lib/validation/catalog";
import {
  removeCategory,
  saveCategory,
  saveService,
} from "@/server/catalog/actions";
import type { listCatalog } from "@/server/catalog/service";

type Category = Awaited<ReturnType<typeof listCatalog>>[number];
type Service = Category["services"][number];

export function ServicesView({ categories }: { categories: Category[] }) {
  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Услуги"
        description="Прайс салона. Цены и длительность у каждого мастера свои — их задают в карточке мастера, а здесь значения по умолчанию."
        actions={
          <>
            <FormDialog
              title="Новая категория"
              trigger={
                <Button variant="outline">
                  <Plus aria-hidden /> Категория
                </Button>
              }
            >
              {(close) => <CategoryForm onDone={close} />}
            </FormDialog>
            <FormDialog
              title="Новая услуга"
              trigger={
                <Button disabled={categories.length === 0}>
                  <Plus aria-hidden /> Услуга
                </Button>
              }
            >
              {(close) => (
                <ServiceForm categoryOptions={categoryOptions} onDone={close} />
              )}
            </FormDialog>
          </>
        }
      />

      {categories.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-muted-foreground">
          Пока нет ни одной категории. Начните с категории, например «Стрижки».
        </p>
      )}

      {categories.map((category) => (
        <Card key={category.id}>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-lg">{category.name}</CardTitle>
            <div className="flex gap-1">
              <FormDialog
                title="Категория"
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Изменить категорию «${category.name}»`}
                  >
                    <Pencil aria-hidden />
                  </Button>
                }
              >
                {(close) => <CategoryForm category={category} onDone={close} />}
              </FormDialog>
              <ConfirmAction
                title={`Удалить категорию «${category.name}»?`}
                description="Удалить можно только пустую категорию. Услуги из неё сначала перенесите в другую."
                action={() => removeCategory(category.id)}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Удалить категорию «${category.name}»`}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                }
              />
            </div>
          </CardHeader>
          <CardContent>
            {category.services.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                В категории пока нет услуг.
              </p>
            ) : (
              <ul className="divide-y">
                {category.services.map((service) => (
                  <ServiceRow
                    key={service.id}
                    service={service}
                    categoryOptions={categoryOptions}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ServiceRow({
  service,
  categoryOptions,
}: {
  service: Service;
  categoryOptions: { value: string; label: string }[];
}) {
  const masters = service._count.masters;
  const details = [
    `${service.durationMin} мин`,
    service.bufferMin !== null ? `уборка ${service.bufferMin} мин` : null,
    `${masters} ${plural(masters, ["мастер", "мастера", "мастеров"])}`,
  ].filter(Boolean);

  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{service.name}</span>
          {!service.isActive && <Badge variant="secondary">Скрыта</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">{details.join(" · ")}</p>
      </div>
      <span className="shrink-0 tabular-nums">
        {formatMoney(service.price)}
      </span>
      <FormDialog
        title="Услуга"
        trigger={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Изменить услугу «${service.name}»`}
          >
            <Pencil aria-hidden />
          </Button>
        }
      >
        {(close) => (
          <ServiceForm
            service={service}
            categoryOptions={categoryOptions}
            onDone={close}
          />
        )}
      </FormDialog>
    </li>
  );
}

function CategoryForm({
  category,
  onDone,
}: {
  category?: Category;
  onDone: () => void;
}) {
  const form = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? "",
      sortOrder: category?.sortOrder ?? 0,
    },
  });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const result = await submitAction(form, () =>
          saveCategory(category?.id ?? null, values),
        );
        if (result?.ok) onDone();
      })}
    >
      <FieldGroup>
        <TextField control={form.control} name="name" label="Название" />
        <NumberField
          control={form.control}
          name="sortOrder"
          label="Порядок"
          description="Категории с меньшим числом показываются выше."
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Сохранить
        </Button>
      </FieldGroup>
    </form>
  );
}

function ServiceForm({
  service,
  categoryOptions,
  onDone,
}: {
  service?: Service;
  categoryOptions: { value: string; label: string }[];
  onDone: () => void;
}) {
  const form = useForm<ServiceInput>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      categoryId: service?.categoryId ?? categoryOptions[0]?.value ?? "",
      name: service?.name ?? "",
      description: service?.description ?? "",
      durationMin: service?.durationMin ?? 60,
      priceRub: service ? kopecksToRubles(service.price) : 1500,
      bufferMin: service?.bufferMin ?? null,
      isActive: service?.isActive ?? true,
      sortOrder: service?.sortOrder ?? 0,
    },
  });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const result = await submitAction(form, () =>
          saveService(service?.id ?? null, values),
        );
        if (result?.ok) onDone();
      })}
    >
      <FieldGroup>
        <SelectField
          control={form.control}
          name="categoryId"
          label="Категория"
          options={categoryOptions}
        />
        <TextField control={form.control} name="name" label="Название" />
        <TextareaField
          control={form.control}
          name="description"
          label="Описание"
          description="Показывается клиентам на сайте."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            control={form.control}
            name="durationMin"
            label="Длительность"
            suffix="мин"
            step={5}
          />
          <NumberField
            control={form.control}
            name="priceRub"
            label="Цена по умолчанию"
            suffix="₽"
            step={0.01}
          />
          <NumberField
            control={form.control}
            name="bufferMin"
            label="Уборка после"
            suffix="мин"
            step={5}
            nullable
            placeholder="10"
            description="Пусто — как в настройках салона (10 мин)."
          />
          <NumberField
            control={form.control}
            name="sortOrder"
            label="Порядок"
          />
        </div>
        <SwitchField
          control={form.control}
          name="isActive"
          label="Показывать в записи"
          description="Скрытая услуга остаётся в истории записей, но её нельзя выбрать."
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Сохранить
        </Button>
      </FieldGroup>
    </form>
  );
}
