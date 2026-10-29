import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { Suspense } from "react";
import { MasterAvatar } from "@/components/master-avatar";
import { MasterPhoto } from "@/components/admin/masters/master-photo";
import { MasterProfileForm } from "@/components/admin/masters/master-profile-form";
import {
  MasterPromotions,
  type PromotionItem,
} from "@/components/admin/masters/master-promotions";
import { MasterSchedule } from "@/components/admin/masters/master-schedule";
import { MasterServices } from "@/components/admin/masters/master-services";
import { MasterTabs } from "@/components/admin/masters/master-tabs";
import {
  MasterTimeOffs,
  type TimeOffItem,
} from "@/components/admin/masters/master-time-offs";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { Badge } from "@/components/ui/badge";
import {
  discountStatus,
  formatDiscountPeriod,
  formatTimeOffPeriod,
} from "@/components/admin/format";
import { formatDiscount } from "@/lib/money";
import { minutesToTime, toSalonDate } from "@/lib/time";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";
import { db } from "@/server/db";
import { discountToForm } from "@/server/discount-input";
import { getMasterDetail, listServiceOptions } from "@/server/masters/service";

export const metadata: Metadata = { title: "Мастер" };

export default function MasterPage({
  params,
}: PageProps<"/admin/masters/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MasterDetail params={params} />
    </Suspense>
  );
}

async function MasterDetail({
  params,
}: Pick<PageProps<"/admin/masters/[id]">, "params">) {
  const { id } = await params;
  const staff = await requireRole(...SECTION_ROLES.masters);
  if (staff.role === "MASTER" && staff.masterId !== id) forbidden();

  const now = new Date();
  const [master, serviceOptions] = await Promise.all([
    getMasterDetail(db, staff, id, now),
    listServiceOptions(db),
  ]);
  if (!master) notFound();
  const canManage = staff.role !== "MASTER";

  const offered = master.services.map((ms) => ({
    serviceId: ms.serviceId,
    name: ms.service.name,
    category: ms.service.category.name,
    price: ms.price,
    durationMin: ms.durationMin,
    defaultPrice: ms.service.price,
    defaultDurationMin: ms.service.durationMin,
    isActive: ms.service.isActive,
  }));

  const promotions: PromotionItem[] = master.promotions.map((promotion) => {
    const discount = discountToForm(promotion);
    return {
      id: promotion.id,
      title: promotion.title,
      scope: promotion.service?.name ?? "Все услуги",
      discount: formatDiscount(promotion.kind, promotion.value),
      period: formatDiscountPeriod(discount.validFrom, discount.validUntil),
      status: discountStatus(promotion, now),
      form: {
        title: promotion.title,
        serviceId: promotion.serviceId ?? "",
        isActive: promotion.isActive,
        ...discount,
      },
    };
  });

  const schedule = {
    days: Array.from({ length: 7 }, (_, weekday) =>
      master.workingHours
        .filter((row) => row.weekday === weekday)
        .map((row) => ({
          start: minutesToTime(row.startMin),
          end: minutesToTime(row.endMin),
        })),
    ),
  };

  const timeOffs: TimeOffItem[] = master.timeOffs.map((timeOff) => ({
    id: timeOff.id,
    period: formatTimeOffPeriod(timeOff.startsAt, timeOff.endsAt),
    reason: timeOff.reason,
    past: timeOff.endsAt <= now,
  }));

  // Фото меняют редко, поэтому оно живёт во вкладке «Профиль», а не в шапке:
  // на телефоне рабочие вкладки (цены, график) начинаются с первого экрана.
  const profile = canManage ? (
    <div className="flex max-w-2xl flex-col gap-6 sm:flex-row sm:items-start">
      <MasterPhoto
        masterId={master.id}
        name={master.name}
        photoPath={master.photoPath}
      />
      <div className="min-w-0 flex-1">
        <MasterProfileForm
          masterId={master.id}
          defaults={{
            name: master.name,
            title: master.title ?? "",
            bio: master.bio ?? "",
            isActive: master.isActive,
            sortOrder: master.sortOrder,
          }}
        />
        <p className="mt-6 text-sm text-muted-foreground">
          {master.user
            ? `Вход в CRM: ${master.user.email}${master.user.isActive ? "" : " (отключён)"}.`
            : "У мастера нет входа в CRM."}{" "}
          Учётные записи настраивает владелец в разделе «Пользователи».
        </p>
      </div>
    </div>
  ) : (
    <dl className="grid max-w-xl gap-4">
      <div>
        <dt className="text-sm text-muted-foreground">Должность</dt>
        <dd>{master.title ?? "—"}</dd>
      </div>
      <div>
        <dt className="text-sm text-muted-foreground">О мастере</dt>
        <dd className="whitespace-pre-line">{master.bio ?? "—"}</dd>
      </div>
      <p className="text-sm text-muted-foreground">
        Профиль и фото меняет администратор салона.
      </p>
    </dl>
  );

  return (
    <div className="flex flex-col gap-6">
      {canManage && (
        <Link
          href="/admin/masters"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> Все мастера
        </Link>
      )}
      <div className="flex items-center gap-4">
        <MasterAvatar
          name={master.name}
          photoPath={master.photoPath}
          sizes="64px"
          className="w-16 shrink-0 [&>span]:text-base"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {master.name}
          </h1>
          <p className="text-muted-foreground">{master.title ?? "Мастер"}</p>
          {!master.isActive && (
            <Badge variant="secondary" className="w-fit">
              Не принимает записи
            </Badge>
          )}
        </div>
      </div>

      <MasterTabs
        items={[
          { value: "profile", label: "Профиль", content: profile },
          {
            value: "services",
            label: "Услуги",
            content: (
              <MasterServices
                masterId={master.id}
                offered={offered}
                options={serviceOptions.map((option) => ({
                  id: option.id,
                  name: option.name,
                  category: option.category.name,
                  price: option.price,
                  durationMin: option.durationMin,
                }))}
              />
            ),
          },
          {
            value: "promotions",
            label: "Акции",
            content: (
              <MasterPromotions
                masterId={master.id}
                promotions={promotions}
                serviceOptions={offered.map((service) => ({
                  value: service.serviceId,
                  label: service.name,
                }))}
              />
            ),
          },
          {
            value: "schedule",
            label: "График",
            content: (
              <MasterSchedule masterId={master.id} defaults={schedule} />
            ),
          },
          {
            value: "time-off",
            label: "Отсутствия",
            content: (
              <MasterTimeOffs
                masterId={master.id}
                timeOffs={timeOffs}
                today={toSalonDate(now)}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
