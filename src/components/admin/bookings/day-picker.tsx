"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

/** Переход к любому дню календаря. */
export function DayPicker({ date }: { date: string }) {
  const router = useRouter();
  return (
    <>
      <label htmlFor="calendar-date" className="sr-only">
        Перейти к дате
      </label>
      <Input
        id="calendar-date"
        type="date"
        defaultValue={date}
        key={date}
        className="h-11 w-auto sm:h-8"
        onChange={(event) => {
          if (event.target.value) {
            router.push(`/admin/calendar?date=${event.target.value}`);
          }
        }}
      />
    </>
  );
}
