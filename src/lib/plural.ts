/** Склонение по числу: plural(3, ["мастер", "мастера", "мастеров"]) → «мастера». */
export function plural(
  count: number,
  [one, few, many]: readonly [string, string, string],
): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
