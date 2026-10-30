"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { idField } from "@/lib/validation/booking";
import {
  type ClientDiscountInput,
  type ClientNoteInput,
  type ClientProfileInput,
  clientDiscountSchema,
  clientNoteSchema,
  clientProfileSchema,
  type TagInput,
  tagSchema,
} from "@/lib/validation/clients";
import { type ActionResult, runAction } from "@/server/action-result";
import { requireRole } from "@/server/auth";
import { MANAGER_ROLES, SECTION_ROLES } from "@/server/auth/access";
import { db } from "@/server/db";
import * as clients from "./service";

// Карточка клиента (DESIGN.md, 8.1). Роль проверяется до runAction, видимость
// клиента для MASTER — в сервисе (clientScope).

export async function saveClientProfile(
  clientId: string,
  input: ClientProfileInput,
): Promise<ActionResult> {
  const staff = await requireRole(...MANAGER_ROLES);
  return runAction(async () => {
    await clients.updateClientProfile(
      db,
      staff,
      idField.parse(clientId),
      clientProfileSchema.parse(input),
    );
    refresh();
    return undefined;
  }, "Контакты сохранены");
}

export async function saveClientDiscount(
  clientId: string,
  input: ClientDiscountInput,
): Promise<ActionResult> {
  const staff = await requireRole(...MANAGER_ROLES);
  return runAction(
    async () => {
      await clients.setClientDiscount(
        db,
        staff,
        idField.parse(clientId),
        clientDiscountSchema.parse(input),
      );
      refresh();
      return undefined;
    },
    input.enabled ? "Скидка сохранена" : "Скидка снята",
  );
}

export async function saveClientTags(
  clientId: string,
  tagIds: string[],
): Promise<ActionResult> {
  const staff = await requireRole(...MANAGER_ROLES);
  return runAction(async () => {
    await clients.setClientTags(
      db,
      staff,
      idField.parse(clientId),
      z.array(idField).max(30).parse(tagIds),
    );
    refresh();
    return undefined;
  }, "Теги сохранены");
}

export async function addTag(
  input: TagInput,
): Promise<ActionResult<{ id: string }>> {
  const staff = await requireRole(...MANAGER_ROLES);
  return runAction(async () => {
    const tag = await clients.createTag(db, staff, tagSchema.parse(input));
    refresh();
    return tag;
  }, "Тег добавлен");
}

export async function removeTag(tagId: string): Promise<ActionResult> {
  const staff = await requireRole(...MANAGER_ROLES);
  return runAction(async () => {
    await clients.deleteTag(db, staff, idField.parse(tagId));
    refresh();
    return undefined;
  }, "Тег удалён");
}

export async function addNote(
  clientId: string,
  input: ClientNoteInput,
): Promise<ActionResult> {
  const staff = await requireRole(...SECTION_ROLES.clients);
  return runAction(async () => {
    await clients.addClientNote(
      db,
      staff,
      idField.parse(clientId),
      clientNoteSchema.parse(input),
    );
    refresh();
    return undefined;
  }, "Заметка добавлена");
}

export async function removeNote(noteId: string): Promise<ActionResult> {
  const staff = await requireRole(...SECTION_ROLES.clients);
  return runAction(async () => {
    await clients.deleteClientNote(db, staff, idField.parse(noteId));
    refresh();
    return undefined;
  }, "Заметка удалена");
}
