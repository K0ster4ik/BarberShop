import { CalendarClock, Clock, Scissors } from "lucide-react";
import type { ReactNode } from "react";
import { MasterAvatar } from "@/components/master-avatar";

export type SummaryMaster = {
  name: string;
  title: string | null;
  photoPath: string | null;
};

/** Что уже выбрано: услуги, мастер, время. Видна на всех шагах после первого. */
export function SelectionSummary({
  services,
  duration,
  master,
  when,
  price,
}: {
  services: string[];
  duration?: string;
  master?: SummaryMaster | "any";
  when?: string;
  price?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      {master && (
        <div className="flex items-center gap-3">
          {master === "any" ? (
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Scissors className="size-5" aria-hidden />
            </span>
          ) : (
            <MasterAvatar
              name={master.name}
              photoPath={master.photoPath}
              sizes="48px"
              className="size-12 shrink-0 rounded-full [&>span]:text-sm"
            />
          )}
          <div className="min-w-0">
            <p className="font-medium">
              {master === "any" ? "Любой мастер" : master.name}
            </p>
            <p className="text-muted-foreground">
              {master === "any"
                ? "Назначим свободного"
                : (master.title ?? "Мастер")}
            </p>
          </div>
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {services.map((name) => (
          <li key={name} className="flex gap-2">
            <Scissors
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            {name}
          </li>
        ))}
      </ul>
      {duration && (
        <p className="flex gap-2 text-muted-foreground">
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
          {duration}
        </p>
      )}
      {when && (
        <p className="flex gap-2 font-medium">
          <CalendarClock
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          {when}
        </p>
      )}
      {price}
    </div>
  );
}
