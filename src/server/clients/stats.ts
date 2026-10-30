import type { BookingStatus } from "@/generated/prisma/enums";

// Показатели карточки клиента (DESIGN.md, 8.1). Чистая функция по уже загруженным
// записям: MASTER передаёт только свои — и видит цифры только по своим визитам.

export type ClientVisit = {
  status: BookingStatus;
  startsAt: Date;
  master: { id: string; name: string };
  amount: number; // что учитывается в сумме: оплаты (салон) или цены услуг (мастер)
};

export type ClientStats = {
  visits: number; // состоявшиеся
  total: number;
  averageCheck: number | null;
  lastVisitAt: Date | null;
  favoriteMaster: { id: string; name: string } | null;
  noShowRate: number | null; // 0..1; null — не с чем сравнивать
  upcoming: number; // будущие ожидающие и подтверждённые
};

export function clientStats(
  bookings: readonly ClientVisit[],
  now: Date,
): ClientStats {
  const completed = bookings.filter((row) => row.status === "COMPLETED");
  const noShows = bookings.filter((row) => row.status === "NO_SHOW").length;
  const total = completed.reduce((sum, row) => sum + row.amount, 0);

  // Любимый мастер — больше всего визитов; при равенстве — к кому ходил последним.
  const byMaster = new Map<
    string,
    { master: ClientVisit["master"]; count: number; last: number }
  >();
  for (const row of completed) {
    const entry = byMaster.get(row.master.id) ?? {
      master: row.master,
      count: 0,
      last: 0,
    };
    entry.count += 1;
    entry.last = Math.max(entry.last, row.startsAt.getTime());
    byMaster.set(row.master.id, entry);
  }
  const favorite = [...byMaster.values()].sort(
    (a, b) => b.count - a.count || b.last - a.last,
  )[0];

  const lastVisit = Math.max(...completed.map((row) => row.startsAt.getTime()));
  return {
    visits: completed.length,
    total,
    // Средний чек — до копейки; на экране он показывается рублями.
    averageCheck:
      completed.length > 0 ? Math.round(total / completed.length) : null,
    lastVisitAt: completed.length > 0 ? new Date(lastVisit) : null,
    favoriteMaster: favorite?.master ?? null,
    noShowRate:
      completed.length + noShows > 0
        ? noShows / (completed.length + noShows)
        : null,
    upcoming: bookings.filter(
      (row) =>
        (row.status === "PENDING" || row.status === "CONFIRMED") &&
        row.startsAt >= now,
    ).length,
  };
}
