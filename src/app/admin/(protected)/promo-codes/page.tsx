import type { Metadata } from "next";
import { Suspense } from "react";
import {
  discountStatus,
  formatDiscountPeriod,
} from "@/components/admin/format";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import {
  type PromoCodeItem,
  PromoCodesView,
} from "@/components/admin/promo-codes/promo-codes-view";
import { formatDiscount } from "@/lib/money";
import { requireRole } from "@/server/auth";
import { SECTION_ROLES } from "@/server/auth/access";
import { db } from "@/server/db";
import { discountToForm } from "@/server/discount-input";
import { listPromoCodes } from "@/server/promo-codes/service";

export const metadata: Metadata = { title: "Промокоды" };

export default function PromoCodesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PromoCodes />
    </Suspense>
  );
}

async function PromoCodes() {
  await requireRole(...SECTION_ROLES.promoCodes);
  const now = new Date();
  const codes = await listPromoCodes(db);

  const items: PromoCodeItem[] = codes.map((code) => {
    const discount = discountToForm(code);
    const status = discountStatus(code, now);
    return {
      id: code.id,
      code: code.code,
      discount: formatDiscount(code.kind, code.value),
      period: formatDiscountPeriod(discount.validFrom, discount.validUntil),
      uses: code.maxUses
        ? `${code.uses} из ${code.maxUses}`
        : String(code.uses),
      status:
        status === "active" && code.maxUses && code.uses >= code.maxUses
          ? "exhausted"
          : status,
      form: {
        code: code.code,
        maxUses: code.maxUses,
        isActive: code.isActive,
        ...discount,
      },
    };
  });

  return <PromoCodesView codes={items} />;
}
