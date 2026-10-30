"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type CountryOption = {
  code: string; // RU
  name: string; // Россия
  dialCode: string; // +7
  popular: boolean; // откуда обычно звонят клиенты салона — в начале списка
};

/**
 * Код страны внутри поля телефона: «+7 ▾». По нажатию — список стран с поиском по
 * названию и коду; название слева, код справа. После выбора фокус уходит в номер.
 */
export function CountryPicker({
  countries,
  value,
  onChange,
  phoneInputId,
}: {
  countries: CountryOption[];
  value: string;
  onChange: (code: string) => void;
  phoneInputId: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = countries.find((country) => country.code === value);
  const groups = [
    { heading: "Часто", items: countries.filter((c) => c.popular) },
    { heading: "Все страны", items: countries.filter((c) => !c.popular) },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Код страны: ${selected?.name ?? ""} ${selected?.dialCode ?? ""}. Изменить`}
          className="flex h-full shrink-0 items-center gap-1 rounded-l-lg border-r border-input pr-2 pl-3 tabular-nums outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
        >
          {selected?.dialCode}
          <ChevronDown className="size-4 opacity-60" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-0"
        // После выбора — сразу к вводу номера, а не обратно на кнопку.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(phoneInputId)?.focus();
        }}
      >
        <Command>
          <CommandInput placeholder="Страна или код" />
          <CommandList>
            <CommandEmpty>Такой страны нет</CommandEmpty>
            {groups.map((group, index) => (
              <div key={group.heading}>
                {index > 0 && <CommandSeparator />}
                <CommandGroup heading={group.heading}>
                  {group.items.map((country) => (
                    <CommandItem
                      key={country.code}
                      // По value cmdk ищет: и «росс», и «+7», и «7» найдут Россию.
                      value={`${country.name} ${country.dialCode} ${country.code}`}
                      data-checked={country.code === value}
                      onSelect={() => {
                        onChange(country.code);
                        setOpen(false);
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {country.name}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {country.dialCode}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
