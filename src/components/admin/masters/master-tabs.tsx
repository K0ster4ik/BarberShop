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
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <TabsList className="w-max">
          {items.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {items.map((item) => (
        <TabsContent key={item.value} value={item.value}>
          {item.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
