"use client";

import { type ComponentProps, type ReactNode, useId } from "react";
import {
  type Control,
  Controller,
  type FieldValues,
  type Path,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

// Поля форм справочников: подпись, контрол, подсказка и ошибка из React Hook Form.
// Подписи всегда видимые и связаны с полем — требование доступности (DESIGN.md, раздел 11).

type BaseProps<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  label: string;
  description?: string;
};

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  ...input
}: BaseProps<T> & Omit<ComponentProps<typeof Input>, "name" | "id">) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Input
            {...input}
            {...field}
            value={field.value ?? ""}
            id={id}
            aria-invalid={fieldState.invalid}
          />
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  rows = 3,
}: BaseProps<T> & { rows?: number }) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Textarea
            {...field}
            value={field.value ?? ""}
            id={id}
            rows={rows}
            aria-invalid={fieldState.invalid}
          />
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

/**
 * Числовое поле. Пустое значение — NaN (схема покажет «Введите число») или null,
 * если поле необязательное (`nullable`).
 */
export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  suffix,
  step = 1,
  nullable = false,
  placeholder,
}: BaseProps<T> & {
  suffix?: string;
  step?: number;
  nullable?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <div className="relative">
            <Input
              id={id}
              type="number"
              inputMode={step < 1 ? "decimal" : "numeric"}
              step={step}
              min={0}
              placeholder={placeholder}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={
                typeof field.value === "number" && !Number.isNaN(field.value)
                  ? field.value
                  : ""
              }
              onChange={(event) => {
                const raw = event.target.value;
                field.onChange(
                  raw === "" ? (nullable ? null : Number.NaN) : Number(raw),
                );
              }}
              className={suffix ? "pr-12" : undefined}
              aria-invalid={fieldState.invalid}
            />
            {suffix && (
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                {suffix}
              </span>
            )}
          </div>
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

// Radix Select не допускает пустое значение у пункта, поэтому «не выбрано» — отдельный маркер.
const EMPTY = "__empty__";

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  options,
  placeholder = "Выберите",
}: BaseProps<T> & {
  options: readonly { value: string; label: string }[];
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Select
            value={field.value === "" ? EMPTY : (field.value ?? undefined)}
            onValueChange={(value) =>
              field.onChange(value === EMPTY ? "" : value)
            }
          >
            <SelectTrigger
              id={id}
              ref={field.ref}
              onBlur={field.onBlur}
              className="w-full"
              aria-invalid={fieldState.invalid}
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem
                  key={option.value || EMPTY}
                  value={option.value || EMPTY}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
}: BaseProps<T>) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            {description && <FieldDescription>{description}</FieldDescription>}
          </FieldContent>
          <Switch
            id={id}
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
            onBlur={field.onBlur}
          />
        </Field>
      )}
    />
  );
}

// Внутри диалога кнопка прилипает к его низу: длинная форма на телефоне прокручивается,
// а «Сохранить» остаётся на виду. Вне диалога это обычная кнопка.
const IN_DIALOG =
  "in-data-[slot=dialog-content]:sticky in-data-[slot=dialog-content]:-bottom-4 in-data-[slot=dialog-content]:z-10 in-data-[slot=dialog-content]:-mx-4 in-data-[slot=dialog-content]:-mb-4 in-data-[slot=dialog-content]:border-t in-data-[slot=dialog-content]:bg-popover in-data-[slot=dialog-content]:p-4";

export function FormSubmit({
  pending,
  children,
}: {
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <div className={IN_DIALOG}>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {children}
      </Button>
    </div>
  );
}
