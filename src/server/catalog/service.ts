import type { CategoryInput, ServiceInput } from "@/lib/validation/catalog";
import { rublesToKopecks } from "@/lib/money";
import { type Db, DomainError } from "@/server/errors";

// Категории и услуги салона (DESIGN.md, 5.1). Права проверяют Server Actions:
// раздел доступен только OWNER и ADMIN.

export async function listCatalog(db: Db) {
  return db.serviceCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      services: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { masters: true } } },
      },
    },
  });
}

async function assertCategoryNameFree(db: Db, name: string, exceptId?: string) {
  const existing = await db.serviceCategory.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new DomainError("Категория с таким названием уже есть", "name");
  }
}

export async function createCategory(db: Db, input: CategoryInput) {
  await assertCategoryNameFree(db, input.name);
  return db.serviceCategory.create({ data: input });
}

export async function updateCategory(db: Db, id: string, input: CategoryInput) {
  await assertCategoryNameFree(db, input.name, id);
  return db.serviceCategory.update({ where: { id }, data: input });
}

export async function deleteCategory(db: Db, id: string) {
  const services = await db.service.count({ where: { categoryId: id } });
  if (services > 0) {
    throw new DomainError(
      "В категории есть услуги — сначала перенесите их в другую категорию",
    );
  }
  await db.serviceCategory.delete({ where: { id } });
}

function toServiceData(input: ServiceInput) {
  return {
    categoryId: input.categoryId,
    name: input.name,
    description: input.description || null,
    durationMin: input.durationMin,
    price: rublesToKopecks(input.priceRub),
    bufferMin: input.bufferMin,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };
}

async function assertCategoryExists(db: Db, categoryId: string) {
  const category = await db.serviceCategory.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!category) throw new DomainError("Категория не найдена", "categoryId");
}

/**
 * Услуга без удаления: её цена и название уже сохранены снимками в записях,
 * поэтому ненужную услугу скрывают (isActive = false).
 */
export async function createService(db: Db, input: ServiceInput) {
  await assertCategoryExists(db, input.categoryId);
  return db.service.create({ data: toServiceData(input) });
}

export async function updateService(db: Db, id: string, input: ServiceInput) {
  await assertCategoryExists(db, input.categoryId);
  return db.service.update({ where: { id }, data: toServiceData(input) });
}
