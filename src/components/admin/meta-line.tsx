import { Fragment } from "react";
import { cn } from "@/lib/utils";

/**
 * Строка подробностей «60 мин · 4 мастера». Части не разрываются посередине —
 * на узком экране перенос идёт только между ними.
 */
export function MetaLine({
  parts,
  className,
}: {
  parts: (string | null | false | undefined)[];
  className?: string;
}) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {parts
        .filter((part): part is string => Boolean(part))
        .map((part, index) => (
          <Fragment key={part}>
            {index > 0 && " · "}
            <span className="whitespace-nowrap">{part}</span>
          </Fragment>
        ))}
    </p>
  );
}
