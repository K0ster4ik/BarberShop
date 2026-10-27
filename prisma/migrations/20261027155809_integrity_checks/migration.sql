-- CHECK-ограничения для инвариантов, которые нельзя выразить в schema.prisma (DESIGN.md, 5.2).
-- Последняя линия защиты: сервисный слой проверяет то же самое с понятными сообщениями.

-- Записи: корректный интервал, неотрицательные деньги.
ALTER TABLE "Booking"
  ADD CONSTRAINT booking_interval_valid
    CHECK ("startsAt" < "endsAt" AND "endsAt" <= "blockedUntil"),
  ADD CONSTRAINT booking_duration_positive
    CHECK ("durationMin" > 0 AND "bufferMin" >= 0),
  ADD CONSTRAINT booking_money_valid
    CHECK ("subtotal" >= 0 AND "salonDiscount" >= 0 AND "totalPrice" >= 0),
  ADD CONSTRAINT booking_cancel_consistent
    CHECK (("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL));

ALTER TABLE "BookingItem"
  ADD CONSTRAINT booking_item_money_valid
    CHECK ("basePrice" >= 0 AND "masterDiscount" >= 0 AND "price" >= 0),
  ADD CONSTRAINT booking_item_duration_positive
    CHECK ("durationMin" > 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT payment_amount_positive
    CHECK ("amount" > 0);

-- Прайс мастеров и рекомендуемый прайс.
ALTER TABLE "Service"
  ADD CONSTRAINT service_values_valid
    CHECK ("price" >= 0 AND "durationMin" > 0 AND ("bufferMin" IS NULL OR "bufferMin" >= 0));

ALTER TABLE "MasterService"
  ADD CONSTRAINT master_service_values_valid
    CHECK ("price" >= 0 AND "durationMin" > 0);

-- Скидки: процент в пределах 1..100, сумма положительная.
ALTER TABLE "MasterPromotion"
  ADD CONSTRAINT master_promotion_value_valid
    CHECK ("value" > 0 AND ("kind" <> 'PERCENT' OR "value" <= 100)),
  ADD CONSTRAINT master_promotion_period_valid
    CHECK ("validFrom" IS NULL OR "validUntil" IS NULL OR "validFrom" < "validUntil");

ALTER TABLE "PromoCode"
  ADD CONSTRAINT promo_code_value_valid
    CHECK ("value" > 0 AND ("kind" <> 'PERCENT' OR "value" <= 100)),
  ADD CONSTRAINT promo_code_period_valid
    CHECK ("validFrom" IS NULL OR "validUntil" IS NULL OR "validFrom" < "validUntil"),
  ADD CONSTRAINT promo_code_max_uses_positive
    CHECK ("maxUses" IS NULL OR "maxUses" > 0),
  ADD CONSTRAINT promo_code_uppercase
    CHECK ("code" = upper("code"));

ALTER TABLE "Client"
  ADD CONSTRAINT client_discount_valid
    CHECK (
      ("discountKind" IS NULL AND "discountValue" IS NULL)
      OR ("discountKind" IS NOT NULL AND "discountValue" > 0
          AND ("discountKind" <> 'PERCENT' OR "discountValue" <= 100))
    ),
  ADD CONSTRAINT client_phone_e164
    CHECK ("phone" ~ '^\+[1-9][0-9]{6,14}$');

-- Расписание.
ALTER TABLE "WorkingHours"
  ADD CONSTRAINT working_hours_valid
    CHECK ("weekday" BETWEEN 0 AND 6 AND "startMin" >= 0 AND "startMin" < "endMin" AND "endMin" <= 1440);

ALTER TABLE "TimeOff"
  ADD CONSTRAINT time_off_interval_valid
    CHECK ("startsAt" < "endsAt");
