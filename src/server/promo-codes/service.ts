import type { PromoCodeInput } from "@/lib/validation/promo-codes";
import { discountToRow } from "@/server/discount-input";
import { type Db, DomainError } from "@/server/errors";

// Промокоды салона (DESIGN.md, 7.3). Раздел доступен OWNER и ADMIN.
// Число использований считается по неотменённым записям — отдельного счётчика нет.

export async function listPromoCodes(db: Db) {
  const [codes, uses] = await Promise.all([
    db.promoCode.findMany({ orderBy: [{ isActive: "desc" }, { code: "asc" }] }),
    db.booking.groupBy({
      by: ["promoCodeId"],
      where: {
        promoCodeId: { not: null },
        status: { not: "CANCELLED" },
        deletedAt: null,
      },
      _count: { _all: true },
    }),
  ]);
  const usesById = new Map(
    uses.map((row) => [row.promoCodeId, row._count._all] as const),
  );
  return codes.map((code) => ({ ...code, uses: usesById.get(code.id) ?? 0 }));
}

async function assertCodeFree(db: Db, code: string, exceptId?: string) {
  const existing = await db.promoCode.findUnique({
    where: { code },
    select: { id: true },
  });
  if (existing && existing.id !== exceptId) {
    throw new DomainError("Такой промокод уже есть", "code");
  }
}

function promoCodeData(input: PromoCodeInput) {
  return {
    code: input.code,
    maxUses: input.maxUses,
    isActive: input.isActive,
    ...discountToRow(input),
  };
}

export async function createPromoCode(db: Db, input: PromoCodeInput) {
  await assertCodeFree(db, input.code);
  return db.promoCode.create({ data: promoCodeData(input) });
}

export async function updatePromoCode(
  db: Db,
  id: string,
  input: PromoCodeInput,
) {
  await assertCodeFree(db, input.code, id);
  return db.promoCode.update({ where: { id }, data: promoCodeData(input) });
}

/** Удалить можно только неиспользованный код; использованный — отключить. */
export async function deletePromoCode(db: Db, id: string) {
  const used = await db.booking.count({ where: { promoCodeId: id } });
  if (used > 0) {
    throw new DomainError(
      "Промокод уже использовали в записях — его можно только отключить",
    );
  }
  await db.promoCode.delete({ where: { id } });
}
