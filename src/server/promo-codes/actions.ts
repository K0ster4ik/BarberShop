"use server";

import { refresh } from "next/cache";
import {
  type PromoCodeInput,
  promoCodeSchema,
} from "@/lib/validation/promo-codes";
import { type ActionResult, runAction } from "@/server/action-result";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";
import { db } from "@/server/db";
import * as promoCodes from "./service";

export async function savePromoCode(
  id: string | null,
  input: PromoCodeInput,
): Promise<ActionResult> {
  await requireRole(...SECTION_ROLES.promoCodes);
  return runAction(
    async () => {
      const data = promoCodeSchema.parse(input);
      if (id) await promoCodes.updatePromoCode(db, id, data);
      else await promoCodes.createPromoCode(db, data);
      refresh();
      return undefined;
    },
    id ? "Промокод сохранён" : "Промокод добавлен",
  );
}

export async function removePromoCode(id: string): Promise<ActionResult> {
  await requireRole(...SECTION_ROLES.promoCodes);
  return runAction(async () => {
    await promoCodes.deletePromoCode(db, id);
    refresh();
    return undefined;
  }, "Промокод удалён");
}
