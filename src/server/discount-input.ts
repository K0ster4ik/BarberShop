import type { DiscountKind } from "@/generated/prisma/enums";
import { kopecksToRubles, rublesToKopecks } from "@/lib/money";
import { addDays, salonTimeToInstant, toSalonDate } from "@/lib/time";

// Перевод скидки между формой и БД — общий для акций мастеров и промокодов.
// В форме: процент или рубли, период — даты «с … по …» включительно.
// В БД: процент или копейки, период — полуинтервал [validFrom, validUntil) по часам салона.

type DiscountForm = {
  kind: DiscountKind;
  value: number;
  validFrom: string;
  validUntil: string;
};

type DiscountRow = {
  kind: DiscountKind;
  value: number;
  validFrom: Date | null;
  validUntil: Date | null;
};

export function discountToRow(input: DiscountForm): DiscountRow {
  return {
    kind: input.kind,
    value:
      input.kind === "PERCENT" ? input.value : rublesToKopecks(input.value),
    validFrom: input.validFrom ? salonTimeToInstant(input.validFrom, 0) : null,
    validUntil: input.validUntil
      ? salonTimeToInstant(addDays(input.validUntil, 1), 0)
      : null,
  };
}

export function discountToForm(row: DiscountRow): DiscountForm {
  return {
    kind: row.kind,
    value: row.kind === "PERCENT" ? row.value : kopecksToRubles(row.value),
    validFrom: row.validFrom ? toSalonDate(row.validFrom) : "",
    validUntil: row.validUntil ? addDays(toSalonDate(row.validUntil), -1) : "",
  };
}

/** Действует ли скидка в момент `at` (с учётом флага и периода). */
export function isDiscountActive(
  row: { isActive: boolean; validFrom: Date | null; validUntil: Date | null },
  at: Date,
): boolean {
  return (
    row.isActive &&
    (row.validFrom === null || row.validFrom <= at) &&
    (row.validUntil === null || at < row.validUntil)
  );
}
