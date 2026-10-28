import { formatMoney } from "@/lib/money";
import type { QuoteView } from "@/server/bookings/quote-view";

/** Цена по услугам со скидками мастера, скидка салона и итог. */
export function PriceBreakdown({ quote }: { quote: QuoteView }) {
  return (
    <dl className="flex flex-col gap-2 text-sm">
      {quote.items.map((item) => (
        <div key={item.name} className="flex justify-between gap-3">
          <dt className="min-w-0">{item.name}</dt>
          <dd className="shrink-0 text-right tabular-nums">
            {item.masterDiscount > 0 && (
              <s className="mr-1.5 text-muted-foreground">
                {formatMoney(item.basePrice)}
              </s>
            )}
            {formatMoney(item.price)}
          </dd>
        </div>
      ))}
      {quote.salonDiscount > 0 && (
        <div className="flex justify-between gap-3 text-primary">
          <dt>{quote.salonDiscountLabel}</dt>
          <dd className="shrink-0 tabular-nums">
            −{formatMoney(quote.salonDiscount)}
          </dd>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-3 border-t pt-3">
        <dt className="font-medium">Итого</dt>
        <dd className="text-xl font-semibold tabular-nums">
          {formatMoney(quote.totalPrice)}
        </dd>
      </div>
    </dl>
  );
}
