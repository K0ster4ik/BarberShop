"use client";

import { Search } from "lucide-react";
import Form from "next/form";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BookingStatus } from "@/generated/prisma/enums";
import type { BookingPeriod } from "@/lib/validation/staff-booking";
import { STATUS_LABELS } from "./labels";
import { type FilterValues, toSearch } from "./search-params";

// Фильтры списка записей живут в адресе: ссылку можно переслать, «назад» работает.

const PERIODS: { value: BookingPeriod; label: string }[] = [
  { value: "upcoming", label: "С сегодняшнего дня" },
  { value: "past", label: "Прошедшие" },
  { value: "all", label: "Все" },
];

const ALL = "all";

export function BookingFilters({
  values,
  masters,
}: {
  values: FilterValues;
  masters: { id: string; name: string }[] | null; // null — MASTER видит только свои
}) {
  const router = useRouter();
  const apply = (patch: Partial<FilterValues>) =>
    router.push(`/admin/bookings${toSearch({ ...values, ...patch })}`);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <Form
        action="/admin/bookings"
        className="flex flex-1 gap-2"
        role="search"
      >
        {values.period !== "upcoming" && (
          <input type="hidden" name="period" value={values.period} />
        )}
        {values.status && (
          <input type="hidden" name="status" value={values.status} />
        )}
        {values.masterId && (
          <input type="hidden" name="master" value={values.masterId} />
        )}
        <label htmlFor="bookings-query" className="sr-only">
          Имя или телефон клиента
        </label>
        <Input
          id="bookings-query"
          name="q"
          type="search"
          defaultValue={values.query}
          // После «назад» поле показывает запрос из адреса, а не прежний ввод.
          key={values.query}
          placeholder="Имя или телефон клиента"
          className="h-11 sm:h-9"
        />
        <Button type="submit" variant="outline" className="h-11 sm:h-9">
          <Search aria-hidden />
          <span className="sr-only sm:not-sr-only">Найти</span>
        </Button>
      </Form>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <FilterSelect
          label="Период"
          value={values.period}
          options={PERIODS}
          onChange={(period) => apply({ period: period as BookingPeriod })}
        />
        <FilterSelect
          label="Статус"
          value={values.status ?? ALL}
          options={[
            { value: ALL, label: "Все статусы" },
            ...Object.entries(STATUS_LABELS).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
          onChange={(status) =>
            apply({
              status: status === ALL ? null : (status as BookingStatus),
            })
          }
        />
        {masters && (
          <FilterSelect
            label="Мастер"
            value={values.masterId ?? ALL}
            options={[
              { value: ALL, label: "Все мастера" },
              ...masters.map((master) => ({
                value: master.id,
                label: master.name,
              })),
            ]}
            onChange={(masterId) =>
              apply({ masterId: masterId === ALL ? null : masterId })
            }
          />
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className="w-full data-[size=default]:h-11 sm:w-44 sm:data-[size=default]:h-9"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
