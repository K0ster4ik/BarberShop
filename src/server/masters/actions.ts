"use server";

import { refresh } from "next/cache";
import { env } from "@/env";
import {
  type MasterProfileInput,
  masterProfileSchema,
  type MasterServiceInput,
  masterServiceSchema,
  type PromotionInput,
  promotionSchema,
  type TimeOffInput,
  timeOffSchema,
  type WeekScheduleInput,
  weekScheduleSchema,
} from "@/lib/validation/masters";
import { type ActionResult, runAction } from "@/server/action-result";
import { requireRole } from "@/server/auth";
import { MANAGER_ROLES, SECTION_ROLES } from "@/server/auth/access";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { MASTER_PHOTO } from "@/server/uploads";
import * as masters from "./service";

// Профиль и фото — OWNER и ADMIN. Цены, акции, график и отпуска — ещё и MASTER,
// но только свои: это проверяет assertOwnMaster в сервисе (DESIGN.md, раздел 4).

export async function saveMasterProfile(
  masterId: string | null,
  input: MasterProfileInput,
): Promise<ActionResult<{ id: string }>> {
  await requireRole(...MANAGER_ROLES);
  return runAction(
    async () => {
      const data = masterProfileSchema.parse(input);
      const master = masterId
        ? await masters.updateMasterProfile(db, masterId, data)
        : await masters.createMaster(db, data);
      refresh();
      return { id: master.id };
    },
    masterId ? "Профиль сохранён" : "Мастер добавлен",
  );
}

export async function uploadMasterPhoto(
  masterId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole(...MANAGER_ROLES);
  return runAction(async () => {
    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      throw new DomainError("Выберите файл с фотографией", "photo");
    }
    if (!(MASTER_PHOTO.types as readonly string[]).includes(file.type)) {
      throw new DomainError("Подойдёт JPEG, PNG или WebP", "photo");
    }
    if (file.size > MASTER_PHOTO.maxBytes) {
      throw new DomainError("Файл больше 5 МБ", "photo");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    await masters.setMasterPhoto(db, env.UPLOADS_DIR, masterId, buffer);
    refresh();
    return undefined;
  }, "Фото обновлено");
}

export async function deleteMasterPhoto(
  masterId: string,
): Promise<ActionResult> {
  await requireRole(...MANAGER_ROLES);
  return runAction(async () => {
    await masters.removeMasterPhoto(db, env.UPLOADS_DIR, masterId);
    refresh();
    return undefined;
  }, "Фото удалено");
}

export async function saveMasterService(
  masterId: string,
  input: MasterServiceInput,
): Promise<ActionResult> {
  const staff = await requireRole(...SECTION_ROLES.masters);
  return runAction(async () => {
    await masters.upsertMasterService(
      db,
      staff,
      masterId,
      masterServiceSchema.parse(input),
    );
    refresh();
    return undefined;
  }, "Цена сохранена");
}

export async function deleteMasterService(
  masterId: string,
  serviceId: string,
): Promise<ActionResult> {
  const staff = await requireRole(...SECTION_ROLES.masters);
  return runAction(async () => {
    await masters.removeMasterService(db, staff, masterId, serviceId);
    refresh();
    return undefined;
  }, "Услуга убрана");
}

export async function savePromotion(
  masterId: string,
  promotionId: string | null,
  input: PromotionInput,
): Promise<ActionResult> {
  const staff = await requireRole(...SECTION_ROLES.masters);
  return runAction(
    async () => {
      const data = promotionSchema.parse(input);
      if (promotionId)
        await masters.updatePromotion(db, staff, promotionId, data);
      else await masters.createPromotion(db, staff, masterId, data);
      refresh();
      return undefined;
    },
    promotionId ? "Акция сохранена" : "Акция добавлена",
  );
}

export async function removePromotion(
  promotionId: string,
): Promise<ActionResult> {
  const staff = await requireRole(...SECTION_ROLES.masters);
  return runAction(async () => {
    await masters.deletePromotion(db, staff, promotionId);
    refresh();
    return undefined;
  }, "Акция удалена");
}

export async function saveWeekSchedule(
  masterId: string,
  input: WeekScheduleInput,
): Promise<ActionResult<{ outside: number }>> {
  const staff = await requireRole(...SECTION_ROLES.masters);
  return runAction(async () => {
    const result = await masters.replaceWeekSchedule(
      db,
      staff,
      masterId,
      weekScheduleSchema.parse(input),
      new Date(),
    );
    refresh();
    return result;
  }, "График сохранён");
}

export async function addTimeOff(
  masterId: string,
  input: TimeOffInput,
): Promise<ActionResult<{ conflicts: number }>> {
  const staff = await requireRole(...SECTION_ROLES.masters);
  return runAction(async () => {
    const result = await masters.createTimeOff(
      db,
      staff,
      masterId,
      timeOffSchema.parse(input),
    );
    refresh();
    return result;
  }, "Отсутствие добавлено");
}

export async function removeTimeOff(timeOffId: string): Promise<ActionResult> {
  const staff = await requireRole(...SECTION_ROLES.masters);
  return runAction(async () => {
    await masters.deleteTimeOff(db, staff, timeOffId);
    refresh();
    return undefined;
  }, "Отсутствие удалено");
}
