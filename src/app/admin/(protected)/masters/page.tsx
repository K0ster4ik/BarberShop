import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MasterAvatar } from "@/components/admin/masters/master-avatar";
import { NewMasterButton } from "@/components/admin/masters/new-master-button";
import { PageHeader } from "@/components/admin/page-header";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { plural } from "@/lib/plural";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";
import { db } from "@/server/db";
import { listMasters } from "@/server/masters/service";

// Ширина карточки в сетке: браузер выбирает файл по этой подсказке. С занижением
// (раньше было «220px» для всех широких экранов) на мониторе 1920 он брал картинку
// 256px и растягивал её до ~400px — фото «мылилось». Числа — из разметки:
// боковое меню 240px с md, отступы main 16/24px, зазор сетки 16px, 2/3/4 колонки.
const CARD_SIZES = [
  "(min-width: 1024px) calc((100vw - 336px) / 4)",
  "(min-width: 768px) calc((100vw - 320px) / 3)",
  "(min-width: 640px) calc((100vw - 64px) / 3)",
  "calc((100vw - 48px) / 2)",
].join(", ");

export const metadata: Metadata = { title: "Мастера" };

export default function MastersPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Masters />
    </Suspense>
  );
}

async function Masters() {
  const staff = await requireRole(...SECTION_ROLES.masters);
  // У мастера одна карточка — сразу открываем её.
  if (staff.role === "MASTER" && staff.masterId) {
    redirect(`/admin/masters/${staff.masterId}`);
  }
  const masters = await listMasters(db, staff);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Мастера"
        description="Профили, фото, цены на услуги, акции, график и отсутствия."
        actions={<NewMasterButton />}
      />
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {masters.map((master) => (
          <li key={master.id}>
            <Link
              href={`/admin/masters/${master.id}`}
              className="group flex flex-col gap-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <MasterAvatar
                name={master.name}
                photoPath={master.photoPath}
                sizes={CARD_SIZES}
                className={master.isActive ? undefined : "opacity-60 grayscale"}
              />
              <div className="flex flex-col gap-1">
                <span className="font-medium group-hover:underline">
                  {master.name}
                </span>
                <span className="text-sm text-muted-foreground">
                  {master.title ?? "Мастер"} · {master._count.services}{" "}
                  {plural(master._count.services, [
                    "услуга",
                    "услуги",
                    "услуг",
                  ])}
                </span>
                {!master.isActive && (
                  <Badge variant="secondary" className="w-fit">
                    Не принимает записи
                  </Badge>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
