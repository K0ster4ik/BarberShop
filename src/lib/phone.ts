import {
  type CountryCode,
  parsePhoneNumberFromString,
} from "libphonenumber-js";

// Телефоны любых стран (DESIGN.md, раздел 16). В БД — только E.164 (+79991234567).
// Метаданные libphonenumber-js по умолчанию («min») проверяют длину номера для страны:
// для записи в салон этого достаточно, а клиентский бандл остаётся лёгким.

export type { CountryCode };

export const DEFAULT_COUNTRY: CountryCode = "RU";

/** Номер в любом привычном виде → E.164 или null, если такого номера быть не может. */
export function normalizePhone(
  raw: string,
  country: CountryCode = DEFAULT_COUNTRY,
): string | null {
  const phone = parsePhoneNumberFromString(raw.trim(), country);
  return phone?.isValid() ? phone.number : null;
}

/** +79991234567 → «+7 999 123 45 67». */
export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

/**
 * Для публичного канала: код страны виден, из национального номера — первая группа
 * и две последние цифры, остальное скрыто: «+7 999 *** ** 67». Если после этого
 * скрытыми остались бы меньше трёх цифр (короткие номера одной группой, как
 * +500 51234), первая группа тоже скрывается: «+500 ***34».
 */
export function maskPhone(e164: string): string {
  const [code = "", ...groups] = formatPhone(e164).split(" ");
  const national = groups.join(" ");
  const digits = national.replace(/\D/g, "").length;
  const firstGroup = (groups[0] ?? "").replace(/\D/g, "").length;
  const shown = digits - firstGroup - 2 >= 3 ? firstGroup : 0;
  let index = 0;
  const masked = national.replace(/\d/g, (digit) => {
    index += 1;
    return index <= shown || index > digits - 2 ? digit : "*";
  });
  return [code, masked].filter(Boolean).join(" ");
}
