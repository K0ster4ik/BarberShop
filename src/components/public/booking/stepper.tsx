import { Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { STEPS, type WizardState, wizardHref } from "./wizard-state";

/** Шаги записи: пройденные — ссылки назад, текущий выделен. */
export function Stepper({ state }: { state: WizardState }) {
  const current = STEPS.findIndex((step) => step.id === state.step);
  return (
    <nav aria-label="Шаги записи">
      <ol className="flex items-start gap-1 sm:gap-2">
        {STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current;
          const marker = (
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary text-primary ring-3 ring-primary/20",
                !done && !active && "text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" aria-hidden /> : index + 1}
            </span>
          );
          const label = (
            <span
              className={cn(
                "text-xs sm:text-sm",
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          );
          return (
            <li
              key={step.id}
              className="flex min-h-11 min-w-0 flex-1 flex-col items-center gap-1.5 text-center sm:flex-row sm:text-left"
              aria-current={active ? "step" : undefined}
            >
              {done ? (
                <Link
                  href={wizardHref({ ...state, step: step.id })}
                  className="flex min-h-11 flex-col items-center gap-1.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-row"
                >
                  {marker}
                  {label}
                  <span className="sr-only">— вернуться</span>
                </Link>
              ) : (
                <>
                  {marker}
                  {label}
                </>
              )}
              {index < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "hidden h-px flex-1 sm:block",
                    done ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
