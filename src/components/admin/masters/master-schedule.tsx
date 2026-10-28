"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Plus, X } from "lucide-react";
import {
  type Control,
  Controller,
  useFieldArray,
  useForm,
} from "react-hook-form";
import { toast } from "sonner";
import { submitAction } from "@/components/forms/submit";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import {
  MAX_INTERVALS_PER_DAY,
  type WeekScheduleInput,
  weekScheduleSchema,
} from "@/lib/validation/masters";
import { saveWeekSchedule } from "@/server/masters/actions";

const DAYS = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];
// В меню «Скопировать на…»: «на вторник», «на среду».
const DAYS_ACCUSATIVE = [
  "понедельник",
  "вторник",
  "среду",
  "четверг",
  "пятницу",
  "субботу",
  "воскресенье",
];
const WEEKDAYS = [0, 1, 2, 3, 4];
const WHOLE_WEEK = [0, 1, 2, 3, 4, 5, 6];

/** Недельный график: несколько интервалов в день — смена с перерывом. */
export function MasterSchedule({
  masterId,
  defaults,
}: {
  masterId: string;
  defaults: WeekScheduleInput;
}) {
  const form = useForm<WeekScheduleInput>({
    resolver: zodResolver(weekScheduleSchema),
    defaultValues: defaults,
  });

  // Типовая неделя одинакова по будням: день заполняют один раз и копируют.
  function copyDay(from: number, targets: number[]) {
    const intervals = form.getValues(`days.${from}`);
    const others = targets.filter((day) => day !== from);
    for (const day of others) {
      form.setValue(
        `days.${day}`,
        intervals.map((interval) => ({ ...interval })),
        { shouldDirty: true },
      );
    }
    toast.info(
      `Скопировано на ${others.length} ${plural(others.length, ["день", "дня", "дней"])}. Не забудьте сохранить график.`,
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await submitAction(form, () =>
          saveWeekSchedule(masterId, values),
        );
        if (result?.ok && result.data.outside > 0) {
          const n = result.data.outside;
          toast.warning(
            `${n} ${plural(n, ["будущая запись", "будущие записи", "будущих записей"])} вне нового графика — их нужно перенести.`,
          );
        }
        if (result?.ok) form.reset(values);
      })}
    >
      <p className="text-sm text-muted-foreground">
        Время по часам салона. Пустой день — выходной. Несколько интервалов —
        смена с перерывом.
      </p>
      <ul className="divide-y rounded-lg border">
        {DAYS.map((day, index) => (
          <DayRow
            key={day}
            control={form.control}
            day={index}
            label={day}
            onCopy={(targets) => copyDay(index, targets)}
          />
        ))}
      </ul>
      {/* С несохранёнными изменениями панель прилипает к низу экрана: после правки понедельника не нужно листать неделю. */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1",
          form.formState.isDirty &&
            "sticky bottom-0 z-10 border-t bg-background py-3",
        )}
      >
        <Button
          type="submit"
          disabled={form.formState.isSubmitting || !form.formState.isDirty}
        >
          Сохранить график
        </Button>
        {form.formState.isDirty && (
          <span className="text-sm text-muted-foreground">
            Есть несохранённые изменения
          </span>
        )}
      </div>
    </form>
  );
}

function DayRow({
  control,
  day,
  label,
  onCopy,
}: {
  control: Control<WeekScheduleInput>;
  day: number;
  label: string;
  onCopy: (targets: number[]) => void;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `days.${day}`,
  });

  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
      <span className="w-32 shrink-0 pt-2 font-medium">{label}</span>
      <div className="flex flex-1 flex-col gap-2">
        {fields.length === 0 && (
          <span className="pt-2 text-sm text-muted-foreground">Выходной</span>
        )}
        {fields.map((field, index) => (
          <div key={field.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <TimeInput
                control={control}
                name={`days.${day}.${index}.start`}
                label={`${label}, интервал ${index + 1}: начало`}
              />
              <span aria-hidden>—</span>
              <TimeInput
                control={control}
                name={`days.${day}.${index}.end`}
                label={`${label}, интервал ${index + 1}: конец`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Убрать интервал ${index + 1}, ${label}`}
                onClick={() => remove(index)}
              >
                <X aria-hidden />
              </Button>
            </div>
            <IntervalError control={control} day={day} index={index} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 sm:flex-col">
        <Button
          type="button"
          variant="outline"
          disabled={fields.length >= MAX_INTERVALS_PER_DAY}
          onClick={() =>
            append(
              fields.length === 0
                ? { start: "10:00", end: "20:00" }
                : { start: "", end: "" },
            )
          }
        >
          <Plus aria-hidden /> Интервал
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost">
              <Copy aria-hidden /> Скопировать
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{label} — на…</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => onCopy(WEEKDAYS)}>
              Все будни
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onCopy(WHOLE_WEEK)}>
              Всю неделю
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {DAYS_ACCUSATIVE.map((name, target) =>
              target === day ? null : (
                <DropdownMenuItem key={name} onSelect={() => onCopy([target])}>
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                </DropdownMenuItem>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function TimeInput({
  control,
  name,
  label,
}: {
  control: Control<WeekScheduleInput>;
  name: `days.${number}.${number}.start` | `days.${number}.${number}.end`;
  label: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Input
          {...field}
          type="time"
          step={300}
          className="h-10 min-w-0 flex-1 sm:h-8 sm:w-32 sm:flex-none"
          aria-label={label}
          aria-invalid={fieldState.invalid}
        />
      )}
    />
  );
}

function IntervalError({
  control,
  day,
  index,
}: {
  control: Control<WeekScheduleInput>;
  day: number;
  index: number;
}) {
  return (
    <Controller
      control={control}
      name={`days.${day}.${index}`}
      render={({ fieldState }) => {
        const error = fieldState.error as
          | { start?: { message?: string }; end?: { message?: string } }
          | undefined;
        const message = error?.start?.message ?? error?.end?.message;
        return message ? (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        ) : (
          <></>
        );
      }}
    />
  );
}
