"use client";

import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/forms/dialogs";
import { Button } from "@/components/ui/button";
import { cancelMyBooking } from "@/server/bookings/site-actions";

export function CancelBookingButton({ token }: { token: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      title="Отменить запись?"
      description="Время освободится для других клиентов. Вернуть запись по этой ссылке будет нельзя — только записаться заново."
      confirmLabel="Отменить запись"
      action={async () => {
        const result = await cancelMyBooking(token);
        // Например, запись уже отменили в другой вкладке: показываем, как есть сейчас.
        if (!result.ok) router.refresh();
        return result;
      }}
      trigger={
        <Button variant="outline" size="lg" className="h-11">
          Отменить запись
        </Button>
      }
    />
  );
}
