import type { TagColor } from "@/lib/validation/clients";
import { cn } from "@/lib/utils";

// Цвет тега: текст на подложке держит контраст в обеих темах. Классы записаны целиком —
// Tailwind находит их по тексту исходников.
export const TAG_STYLES: Record<TagColor, string> = {
  amber: "bg-amber-100 text-amber-950 dark:bg-amber-400/20 dark:text-amber-100",
  emerald:
    "bg-emerald-100 text-emerald-950 dark:bg-emerald-400/20 dark:text-emerald-100",
  rose: "bg-rose-100 text-rose-950 dark:bg-rose-400/20 dark:text-rose-100",
  sky: "bg-sky-100 text-sky-950 dark:bg-sky-400/20 dark:text-sky-100",
  violet:
    "bg-violet-100 text-violet-950 dark:bg-violet-400/20 dark:text-violet-100",
  slate: "bg-slate-200 text-slate-900 dark:bg-slate-400/20 dark:text-slate-100",
};

export const TAG_COLOR_LABELS: Record<TagColor, string> = {
  amber: "Латунь",
  emerald: "Зелёный",
  rose: "Красный",
  sky: "Голубой",
  violet: "Фиолетовый",
  slate: "Серый",
};

function styleOf(color: string | null): string {
  return color && color in TAG_STYLES
    ? TAG_STYLES[color as TagColor]
    : TAG_STYLES.slate;
}

export function TagBadge({
  name,
  color,
  className,
}: {
  name: string;
  color: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap",
        styleOf(color),
        className,
      )}
    >
      {name}
    </span>
  );
}
