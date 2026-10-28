import { Prisma } from "@/generated/prisma/client";

// Prisma 7 + adapter-pg отдаёт ошибки Postgres как PrismaClientKnownRequestError,
// а исходный SQLSTATE кладёт в meta.driverAdapterError.cause (см. DESIGN.md, 5.3).

type PostgresCause = { originalCode?: unknown; originalMessage?: unknown };

function postgresCause(error: unknown): PostgresCause | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError))
    return undefined;
  const adapterError = error.meta?.driverAdapterError;
  if (typeof adapterError !== "object" || adapterError === null) {
    return undefined;
  }
  const cause = (adapterError as { cause?: unknown }).cause;
  return typeof cause === "object" && cause !== null
    ? (cause as PostgresCause)
    : undefined;
}

/** Нарушено ограничение Postgres с указанным SQLSTATE (и, если задано, именем). */
export function isPostgresError(
  error: unknown,
  sqlState: string,
  constraint?: string,
): boolean {
  const cause = postgresCause(error);
  if (cause?.originalCode !== sqlState) return false;
  return (
    constraint === undefined ||
    (typeof cause.originalMessage === "string" &&
      cause.originalMessage.includes(constraint))
  );
}

/** Нарушение уникальности: Prisma маппит его в P2002 или оставляет SQLSTATE 23505. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002") ||
    isPostgresError(error, "23505")
  );
}
