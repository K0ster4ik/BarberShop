"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConfirmAction, FormDialog } from "@/components/forms/dialogs";
import { Button } from "@/components/ui/button";
import { deleteBooking } from "@/server/bookings/staff-actions";
import { type EditBookingDefaults, EditBookingForm } from "./booking-form";

export function EditBookingButton({
  bookingId,
  version,
  masters,
  defaults,
}: {
  bookingId: string;
  version: string; // updatedAt записи: правка поверх чужой не пройдёт
  masters: { id: string; name: string }[];
  defaults: EditBookingDefaults;
}) {
  return (
    <FormDialog
      title="Перенос и цена"
      description="Время, мастер, длительность и скидка. Статус записи не меняется."
      trigger={
        <Button variant="outline" className="h-11 sm:h-8">
          <Pencil aria-hidden /> Изменить
        </Button>
      }
    >
      {(close) => (
        <EditBookingForm
          bookingId={bookingId}
          version={version}
          masters={masters}
          defaults={defaults}
          onDone={close}
        />
      )}
    </FormDialog>
  );
}

/** Мягкое удаление ошибочной записи (DESIGN.md, 7.6) и возврат к списку. */
export function DeleteBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      title="Удалить запись?"
      description="Удаляйте только ошибочные записи: запись пропадёт из расписания и аналитики, а время освободится. Если клиент передумал — отмените запись."
      action={async () => {
        const result = await deleteBooking(bookingId);
        if (result.ok) router.push("/admin/bookings");
        return result;
      }}
      trigger={
        <Button variant="ghost" className="h-11 text-destructive sm:h-8">
          <Trash2 aria-hidden /> Удалить
        </Button>
      }
    />
  );
}
