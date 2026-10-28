import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Ошибка бизнес-правила с текстом для пользователя («В категории есть услуги»).
 * `field` — какое поле формы подсветить. Server Actions превращают её в ответ формы.
 */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** Клиент БД или транзакция: сервисы получают его параметром, чтобы тесты шли на тестовой БД. */
export type Db = PrismaClient | Prisma.TransactionClient;
