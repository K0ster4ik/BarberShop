"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";

/** «Записаться» в шапке. Внутри мастера записи не нужна: там своя главная кнопка. */
export function BookButton() {
  // На маршрутах с параметром ([token]) usePathname ждёт запроса — в статической
  // оболочке там показывается сама кнопка. На /book путь известен заранее,
  // поэтому кнопка не мелькает.
  return (
    <Suspense fallback={<BookLink />}>
      <BookButtonForPath />
    </Suspense>
  );
}

function BookButtonForPath() {
  return usePathname() === "/book" ? null : <BookLink />;
}

function BookLink() {
  return (
    <Button asChild size="lg">
      <Link href="/book">Записаться</Link>
    </Button>
  );
}
