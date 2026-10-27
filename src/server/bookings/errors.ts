import { Prisma } from "@/generated/prisma/client";

const OVERLAP_CONSTRAINT = "booking_no_overlap";
const EXCLUSION_VIOLATION = "23P01";

type PostgresCause = { originalCode?: unknown; originalMessage?: unknown };

// Prisma 7 + adapter-pg отдаёт ошибки Postgres как P2039 («database error»),
// а исходный SQLSTATE кладёт в meta.driverAdapterError.cause.
function postgresCause(
  error: Prisma.PrismaClientKnownRequestError,
): PostgresCause | undefined {
  const adapterError = error.meta?.driverAdapterError;
  if (typeof adapterError !== "object" || adapterError === null) {
    return undefined;
  }
  const cause = (adapterError as { cause?: unknown }).cause;
  return typeof cause === "object" && cause !== null
    ? (cause as PostgresCause)
    : undefined;
}

/** Запись пересеклась с другой записью мастера (constraint booking_no_overlap). */
export function isBookingOverlapError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const cause = postgresCause(error);
  return (
    cause?.originalCode === EXCLUSION_VIOLATION &&
    typeof cause.originalMessage === "string" &&
    cause.originalMessage.includes(OVERLAP_CONSTRAINT)
  );
}
