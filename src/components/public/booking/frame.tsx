import type { ReactNode } from "react";

/**
 * Раскладка шага: слева — выбор, справа — сводка с кнопкой (десктоп). На телефоне
 * сводка и кнопка — в панели, закреплённой внизу экрана.
 */
export function BookingFrame({
  children,
  summary,
  barSummary,
  action,
}: {
  children: ReactNode;
  summary: ReactNode;
  barSummary: ReactNode;
  action: ReactNode;
}) {
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
        <aside className="sticky top-6 hidden flex-col gap-4 rounded-xl border bg-card p-5 lg:flex">
          <h2 className="font-semibold">Ваша запись</h2>
          {summary}
          {action}
          <p className="text-center text-xs text-muted-foreground">
            Без регистрации · запись за минуту
          </p>
        </aside>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 supports-backdrop-filter:bg-background/85 supports-backdrop-filter:backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1 text-sm">{barSummary}</div>
          {action}
        </div>
      </div>
    </>
  );
}
