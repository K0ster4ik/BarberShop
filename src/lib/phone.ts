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
 * Для публичного канала: код страны и первая группа видны, из остального — только
 * две последние цифры. «+7 999 *** ** 67».
 */
export function maskPhone(e164: string): string {
  const [code = "", first = "", ...rest] = formatPhone(e164).split(" ");
  const tail = rest.join(" ");
  const digits = tail.replace(/\D/g, "").length;
  let seen = 0;
  const masked = tail.replace(/\d/g, (digit) => {
    seen += 1;
    return seen > digits - 2 ? digit : "*";
  });
  return [code, first, masked].filter(Boolean).join(" ");
}
