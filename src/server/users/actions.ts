"use server";

import { refresh } from "next/cache";
import { env } from "@/env";
import {
  type PasswordResetInput,
  passwordResetSchema,
  type UserCreateInput,
  userCreateSchema,
  type UserUpdateInput,
  userUpdateSchema,
} from "@/lib/validation/users";
import { type ActionResult, runAction } from "@/server/action-result";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";
import { db } from "@/server/db";
import * as users from "./service";

const options = () => ({ demoMode: env.DEMO_MODE });

export async function createStaff(
  input: UserCreateInput,
): Promise<ActionResult> {
  await requireRole(...SECTION_ROLES.users);
  return runAction(async () => {
    await users.createUser(db, userCreateSchema.parse(input));
    refresh();
    return undefined;
  }, "Сотрудник добавлен");
}

export async function updateStaff(
  userId: string,
  input: UserUpdateInput,
): Promise<ActionResult> {
  const actor = await requireRole(...SECTION_ROLES.users);
  return runAction(async () => {
    await users.updateUser(
      db,
      options(),
      actor,
      userId,
      userUpdateSchema.parse(input),
    );
    refresh();
    return undefined;
  }, "Изменения сохранены");
}

export async function resetStaffPassword(
  userId: string,
  input: PasswordResetInput,
): Promise<ActionResult> {
  await requireRole(...SECTION_ROLES.users);
  return runAction(async () => {
    await users.resetUserPassword(
      db,
      options(),
      userId,
      passwordResetSchema.parse(input),
    );
    refresh();
    return undefined;
  }, "Пароль изменён, сотрудник вышел со всех устройств");
}
