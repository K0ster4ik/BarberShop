"use server";

import { refresh } from "next/cache";
import {
  type CategoryInput,
  categorySchema,
  type ServiceInput,
  serviceSchema,
} from "@/lib/validation/catalog";
import { type ActionResult, runAction } from "@/server/action-result";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";
import { db } from "@/server/db";
import * as catalog from "./service";

// requireRole — до runAction: его redirect()/forbidden() должны дойти до Next.js.

export async function saveCategory(
  id: string | null,
  input: CategoryInput,
): Promise<ActionResult> {
  await requireRole(...SECTION_ROLES.services);
  return runAction(
    async () => {
      const data = categorySchema.parse(input);
      if (id) await catalog.updateCategory(db, id, data);
      else await catalog.createCategory(db, data);
      refresh();
      return undefined;
    },
    id ? "Категория сохранена" : "Категория добавлена",
  );
}

export async function removeCategory(id: string): Promise<ActionResult> {
  await requireRole(...SECTION_ROLES.services);
  return runAction(async () => {
    await catalog.deleteCategory(db, id);
    refresh();
    return undefined;
  }, "Категория удалена");
}

export async function saveService(
  id: string | null,
  input: ServiceInput,
): Promise<ActionResult> {
  await requireRole(...SECTION_ROLES.services);
  return runAction(
    async () => {
      const data = serviceSchema.parse(input);
      if (id) await catalog.updateService(db, id, data);
      else await catalog.createService(db, data);
      refresh();
      return undefined;
    },
    id ? "Услуга сохранена" : "Услуга добавлена",
  );
}
