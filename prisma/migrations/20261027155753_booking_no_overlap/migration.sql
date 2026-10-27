-- Защита от двойной записи на уровне БД (DESIGN.md, 5.3).
-- Prisma не поддерживает exclusion constraints, поэтому миграция написана вручную.
--
-- Интервал берётся вместе с буфером на уборку: следующая запись мастера может начаться
-- не раньше blockedUntil предыдущей. blockedUntil хранится колонкой, потому что
-- timestamptz + interval не IMMUTABLE и не годится для выражения в индексе.
-- При конфликте Postgres возвращает SQLSTATE 23P01.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
  ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    "masterId" WITH =,
    tstzrange("startsAt", "blockedUntil", '[)') WITH &&
  )
  WHERE (status IN ('PENDING', 'CONFIRMED', 'COMPLETED') AND "deletedAt" IS NULL);
