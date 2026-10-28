import { Skeleton } from "@/components/ui/skeleton";

/** Скелет содержимого раздела, пока проверяется сессия и грузятся данные. */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
