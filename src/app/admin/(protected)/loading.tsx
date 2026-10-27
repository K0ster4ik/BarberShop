import { Skeleton } from "@/components/ui/skeleton";

// Граница Suspense для страниц админки: каждая страница сама проверяет сессию,
// и без неё переход между разделами ждал бы сервер. С ней меню остаётся на месте,
// а на месте содержимого сразу появляется скелет.
export default function AdminPageLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-24 w-full max-w-xs" />
    </div>
  );
}
