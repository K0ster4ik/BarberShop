import type { PrismaClient } from "@/generated/prisma/client";
import { normalizePhone } from "@/lib/phone";
import { salonTimeToInstant } from "@/lib/time";
import type {
  ClientDiscountInput,
  ClientNoteInput,
  ClientProfileInput,
  TagInput,
} from "@/lib/validation/clients";
import {
  clientScope,
  ForbiddenError,
  type StaffUser,
} from "@/server/auth/access";
import { isUniqueViolation } from "@/server/db-errors";
import { discountToRow } from "@/server/discount-input";
import { DomainError, type Db } from "@/server/errors";

// Изменения карточки клиента (DESIGN.md, 8.1 и раздел 4). Контакты, постоянная скидка
// и теги — OWNER и ADMIN. Заметки пишет любой сотрудник, который видит клиента;
// удаляет — автор, OWNER или ADMIN.

export const CLIENT_NOT_FOUND = "Клиент не найден.";

const isManager = (staff: StaffUser) =>
  staff.role === "OWNER" || staff.role === "ADMIN";

function assertManager(staff: StaffUser): void {
  if (!isManager(staff)) throw new ForbiddenError();
}

/** Клиент, которого видит сотрудник (MASTER — только клиентов своих записей). */
async function assertVisible(db: Db, staff: StaffUser, clientId: string) {
  const client = await db.client.findFirst({
    where: { AND: [{ id: clientId }, clientScope(staff)] },
    select: { id: true },
  });
  if (!client) throw new DomainError(CLIENT_NOT_FOUND);
}

export async function updateClientProfile(
  db: Db,
  staff: StaffUser,
  clientId: string,
  input: ClientProfileInput,
): Promise<void> {
  assertManager(staff);
  const phone = normalizePhone(input.phone);
  if (!phone) throw new DomainError("Проверьте номер телефона", "phone");
  try {
    const updated = await db.client.updateMany({
      where: { id: clientId },
      data: {
        name: input.name,
        phone,
        email: input.email || null,
        // Дата рождения — календарный день: храним полдень, чтобы пояс её не сдвинул.
        birthday: input.birthday
          ? salonTimeToInstant(input.birthday, 12 * 60)
          : null,
      },
    });
    if (updated.count === 0) throw new DomainError(CLIENT_NOT_FOUND);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError("Клиент с таким телефоном уже есть", "phone");
    }
    throw error;
  }
}

export async function setClientDiscount(
  db: Db,
  staff: StaffUser,
  clientId: string,
  input: ClientDiscountInput,
): Promise<void> {
  assertManager(staff);
  const discount =
    input.enabled && input.value !== null
      ? discountToRow({
          kind: input.kind,
          value: input.value,
          validFrom: "",
          validUntil: "",
        })
      : null;
  const updated = await db.client.updateMany({
    where: { id: clientId },
    data: {
      discountKind: discount?.kind ?? null,
      discountValue: discount?.value ?? null,
    },
  });
  if (updated.count === 0) throw new DomainError(CLIENT_NOT_FOUND);
}

/** Теги клиента целиком: какие отмечены в форме, те и остаются. */
export async function setClientTags(
  db: PrismaClient,
  staff: StaffUser,
  clientId: string,
  tagIds: readonly string[],
): Promise<void> {
  assertManager(staff);
  const ids = [...new Set(tagIds)];
  await assertVisible(db, staff, clientId);
  await db.$transaction(async (tx) => {
    // Иначе два одновременных сохранения разных наборов слились бы в один.
    await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${clientId} FOR UPDATE`;
    const known = await tx.tag.count({ where: { id: { in: ids } } });
    if (known !== ids.length) {
      throw new DomainError("Тег удалили — обновите страницу.");
    }
    await tx.clientTag.deleteMany({
      where: { clientId, tagId: { notIn: ids } },
    });
    await tx.clientTag.createMany({
      data: ids.map((tagId) => ({ clientId, tagId })),
      skipDuplicates: true,
    });
  });
}

export async function createTag(
  db: Db,
  staff: StaffUser,
  input: TagInput,
): Promise<{ id: string }> {
  assertManager(staff);
  try {
    return await db.tag.create({
      data: { name: input.name, color: input.color },
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError("Такой тег уже есть", "name");
    }
    throw error;
  }
}

/** Тег пропадает у всех клиентов — это видно в подтверждении. */
export async function deleteTag(
  db: Db,
  staff: StaffUser,
  tagId: string,
): Promise<void> {
  assertManager(staff);
  const deleted = await db.tag.deleteMany({ where: { id: tagId } });
  if (deleted.count === 0) throw new DomainError("Тег уже удалён.");
}

export async function addClientNote(
  db: Db,
  staff: StaffUser,
  clientId: string,
  input: ClientNoteInput,
): Promise<void> {
  await assertVisible(db, staff, clientId);
  await db.clientNote.create({
    data: { clientId, authorId: staff.id, text: input.text },
  });
}

export async function deleteClientNote(
  db: Db,
  staff: StaffUser,
  noteId: string,
): Promise<void> {
  const note = await db.clientNote.findFirst({
    where: { id: noteId, client: clientScope(staff) },
    select: { authorId: true },
  });
  if (!note) throw new DomainError("Заметка не найдена.");
  if (!isManager(staff) && note.authorId !== staff.id) {
    throw new ForbiddenError("Удалить можно только свою заметку.");
  }
  await db.clientNote.delete({ where: { id: noteId } });
}
