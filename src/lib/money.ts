// Деньги хранятся в копейках (Int). Только здесь они превращаются в рубли
// и строки для отображения (DESIGN.md, раздел 5.2, инвариант 1).

const wholeRubles = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const rublesWithKopecks = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function assertKopecks(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `Money must be an integer amount of kopecks: ${value}`,
    );
  }
}

/** 150000 → «1 500 ₽», 150050 → «1 500,50 ₽». */
export function formatMoney(kopecks: number): string {
  assertKopecks(kopecks);
  const formatter = kopecks % 100 === 0 ? wholeRubles : rublesWithKopecks;
  return formatter.format(kopecks / 100);
}

/** Сумма из формы в рублях (до двух знаков после запятой) → копейки. */
export function rublesToKopecks(rubles: number): number {
  if (!Number.isFinite(rubles)) {
    throw new RangeError(`Invalid rubles amount: ${rubles}`);
  }
  return Math.round(rubles * 100);
}

/** Скидка округляется до целого рубля в пользу клиента (DESIGN.md, 7.3). */
export function roundDiscountUp(kopecks: number): number {
  return Math.ceil(kopecks / 100) * 100;
}

/** Скидка для показа: «−20%» или «−300 ₽». value — проценты или копейки. */
export function formatDiscount(
  kind: "PERCENT" | "AMOUNT",
  value: number,
): string {
  return kind === "PERCENT" ? `−${value}%` : `−${formatMoney(value)}`;
}

/** Копейки → рубли для полей ввода. */
export function kopecksToRubles(kopecks: number): number {
  assertKopecks(kopecks);
  return kopecks / 100;
}
