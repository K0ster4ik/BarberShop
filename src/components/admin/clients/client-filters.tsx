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
import type { ClientSegment } from "@/lib/validation/clients";
import { type ClientFilterValues, toClientSearch } from "./search-params";

// Фильтры клиентов живут в адресе: ссылку можно переслать, «назад» работает.

const SEGMENTS: { value: ClientSegment; label: string }[] = [
  { value: "all", label: "Все клиенты" },
  { value: "sleeping", label: "Давно не были" },
  { value: "new", label: "Новые за 30 дней" },
];

const ALL = "all";

export function ClientFilters({
  values,
  tags,
  masters,
}: {
  values: ClientFilterValues;
  tags: { id: string; name: string }[];
  masters: { id: string; name: string }[] | null; // null — MASTER видит только своих
}) {
  const router = useRouter();
  const apply = (patch: Partial<ClientFilterValues>) =>
    router.push(`/admin/clients${toClientSearch({ ...values, ...patch })}`);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <Form action="/admin/clients" className="flex flex-1 gap-2" role="search">
        {values.tagId && (
          <input type="hidden" name="tag" value={values.tagId} />
        )}
        {values.masterId && (
          <input type="hidden" name="master" value={values.masterId} />
        )}
        {values.segment !== "all" && (
          <input type="hidden" name="segment" value={values.segment} />
        )}
        <label htmlFor="clients-query" className="sr-only">
          Имя или телефон
        </label>
        <Input
          id="clients-query"
          name="q"
          type="search"
          defaultValue={values.query}
          // После «назад» поле показывает запрос из адреса, а не прежний ввод.
          key={values.query}
          placeholder="Имя или телефон"
          className="h-11 sm:h-9"
        />
        <Button type="submit" variant="outline" className="h-11 sm:h-9">
          <Search aria-hidden />
          <span className="sr-only sm:not-sr-only">Найти</span>
        </Button>
      </Form>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <FilterSelect
          label="Подборка"
          value={values.segment}
          options={SEGMENTS}
          onChange={(segment) => apply({ segment: segment as ClientSegment })}
        />
        <FilterSelect
          label="Тег"
          value={values.tagId ?? ALL}
          options={[
            { value: ALL, label: "Все теги" },
            ...tags.map((tag) => ({ value: tag.id, label: tag.name })),
          ]}
          onChange={(tagId) => apply({ tagId: tagId === ALL ? null : tagId })}
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
      <SelectTrigger aria-label={label} className="h-11 w-full sm:h-9 sm:w-44">
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
