"use client";

import { ConfirmAction } from "@/components/forms/dialogs";
import { Button } from "@/components/ui/button";
import { cancelMyBooking } from "@/server/bookings/site-actions";

export function CancelBookingButton({ token }: { token: string }) {
  return (
    <ConfirmAction
      title="Отменить запись?"
      description="Время освободится для других клиентов. Вернуть запись по этой ссылке будет нельзя — только записаться заново."
      confirmLabel="Отменить запись"
      action={() => cancelMyBooking(token)}
      trigger={
        <Button variant="outline" size="lg" className="h-11">
          Отменить запись
        </Button>
      }
    />
  );
}
