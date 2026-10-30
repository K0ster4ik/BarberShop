import { Check } from "lucide-react";
import type { BookingStatus } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  PAYMENT_STATE_LABELS,
  paymentState,
  STATUS_BADGE,
  STATUS_LABELS,
} from "./labels";

const BADGE =
  "inline-flex h-5 w-fit shrink-0 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap";

/** Статус записи; у состоявшегося визита — ещё и оплата. */
export function StatusBadge({
  status,
  totalPrice,
  paid,
  className,
}: {
  status: BookingStatus;
  totalPrice?: number;
  paid?: number;
  className?: string;
}) {
  const payment =
    totalPrice === undefined || paid === undefined
      ? null
      : paymentState(status, totalPrice, paid);
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      <span className={cn(BADGE, STATUS_BADGE[status])}>
        {STATUS_LABELS[status]}
      </span>
      {payment && payment !== "paid" && totalPrice !== undefined && (
        <span
          className={cn(
            BADGE,
            "border border-amber-600/50 text-amber-900 dark:border-amber-300/50 dark:text-amber-100",
          )}
        >
          К оплате {formatMoney(totalPrice - (paid ?? 0))}
        </span>
      )}
      {payment === "paid" && (
        <span
          className={cn(
            BADGE,
            "gap-1 border border-emerald-600/40 text-emerald-900 dark:border-emerald-300/40 dark:text-emerald-100",
          )}
        >
          <Check className="size-3" aria-hidden />
          {PAYMENT_STATE_LABELS.paid}
        </span>
      )}
    </span>
  );
}
