"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/forms/dialogs";
import { FormSubmit, SwitchField, TextField } from "@/components/forms/fields";
import { submitAction } from "@/components/forms/submit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { plural } from "@/lib/plural";
import { type TimeOffInput, timeOffSchema } from "@/lib/validation/masters";
import { addTimeOff, removeTimeOff } from "@/server/masters/actions";

export type TimeOffItem = {
  id: string;
  period: string; // «5–9 ноября 2026 г.» или «30 октября 2026 г., 12:00–14:00»
  reason: string | null;
  past: boolean;
};

export function MasterTimeOffs({
  masterId,
  timeOffs,
  today,
}: {
  masterId: string;
  timeOffs: TimeOffItem[];
  today: string;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Отпуск, больничный или отлучка на несколько часов. В это время к
          мастеру нельзя записаться.
        </p>
        {timeOffs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-muted-foreground">
            Отсутствий не запланировано.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {timeOffs.map((timeOff) => (
              <li
                key={timeOff.id}
                className={`flex items-center gap-3 p-3 ${timeOff.past ? "text-muted-foreground" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {timeOff.reason ?? "Отсутствие"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {timeOff.period}
                    {timeOff.past && " · прошёл"}
                  </p>
                </div>
                <ConfirmAction
                  title="Удалить отсутствие?"
                  description="Время снова станет доступным для записи."
                  action={() => removeTimeOff(timeOff.id)}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Удалить: ${timeOff.reason ?? "отсутствие"}, ${timeOff.period}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Новое отсутствие</CardTitle>
        </CardHeader>
        <CardContent>
          <TimeOffForm masterId={masterId} today={today} />
        </CardContent>
      </Card>
    </div>
  );
}

function TimeOffForm({ masterId, today }: { masterId: string; today: string }) {
  const defaults: TimeOffInput = {
    allDay: true,
    fromDate: today,
    fromTime: "13:00",
    toDate: today,
    toTime: "14:00",
    reason: "",
  };
  const form = useForm<TimeOffInput>({
    resolver: zodResolver(timeOffSchema),
    defaultValues: defaults,
  });
  const allDay = useWatch({ control: form.control, name: "allDay" });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const result = await submitAction(form, () =>
          addTimeOff(masterId, values),
        );
        if (!result?.ok) return;
        if (result.data.conflicts > 0) {
          const n = result.data.conflicts;
          toast.warning(
            `На это время ${plural(n, ["приходится", "приходятся", "приходятся"])} ${n} ${plural(n, ["запись", "записи", "записей"])} — их нужно перенести.`,
          );
        }
        form.reset(defaults);
      })}
    >
      <FieldGroup>
        <SwitchField
          control={form.control}
          name="allDay"
          label="На целые дни"
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            control={form.control}
            name="fromDate"
            label="С"
            type="date"
          />
          {!allDay && (
            <TextField
              control={form.control}
              name="fromTime"
              label="Время"
              type="time"
              step={300}
            />
          )}
          <TextField
            control={form.control}
            name="toDate"
            label={allDay ? "По (включительно)" : "По"}
            type="date"
          />
          {!allDay && (
            <TextField
              control={form.control}
              name="toTime"
              label="Время"
              type="time"
              step={300}
            />
          )}
        </div>
        <TextField
          control={form.control}
          name="reason"
          label="Причина"
          placeholder="Отпуск, больничный, врач"
        />
        <FormSubmit pending={form.formState.isSubmitting}>Добавить</FormSubmit>
      </FieldGroup>
    </form>
  );
}
