"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Вкладки карточки мастера; активная хранится в адресе (?tab=), чтобы ссылкой можно было поделиться. */
export function MasterTabs({
  items,
}: {
  items: { value: string; label: string; content: ReactNode }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const value = items.some((item) => item.value === requested)
    ? (requested as string)
    : (items[0]?.value ?? "");

  return (
    <Tabs
      value={value}
      onValueChange={(next) =>
        router.replace(`${pathname}?tab=${next}`, { scroll: false })
      }
      className="flex flex-col gap-4"
    >
      {/* На телефоне — сетка в два ряда: все вкладки видны, ничего не прячется за краем. */}
      <TabsList className="grid w-full grid-cols-3 group-data-horizontal/tabs:h-auto sm:inline-flex sm:w-fit">
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            className="min-h-10 sm:min-h-0"
          >
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.map((item) => (
        <TabsContent key={item.value} value={item.value}>
          {item.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
