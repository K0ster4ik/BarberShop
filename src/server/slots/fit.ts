import { salon } from "@/config/salon";
import { addMinutes, type DateString, salonTimeToInstant } from "@/lib/time";
import type { Interval } from "./available";

/**
 * Помещается ли визит в график мастера на этот день и не попадает ли на отсутствие.
 * Админ может записать и вне графика (DESIGN.md, 6.3) — эта проверка только
 * предупреждает его. Соприкасающиеся интервалы графика считаются одной сменой.
 */
export function fitsSchedule(input: {
  date: DateString;
  start: Date;
  durationMin: number;
  workingHours: readonly { startMin: number; endMin: number }[];
  timeOffs: readonly Interval[];
  timezone?: string;
}): boolean {
  const timezone = input.timezone ?? salon.timezone;
  const end = addMinutes(input.start, input.durationMin);
  const shifts: { start: number; end: number }[] = [];
  for (const hours of [...input.workingHours].sort(
    (a, b) => a.startMin - b.startMin,
  )) {
    const last = shifts.at(-1);
    if (last && hours.startMin <= last.end) {
      last.end = Math.max(last.end, hours.endMin);
    } else {
      shifts.push({ start: hours.startMin, end: hours.endMin });
    }
  }
  const inShift = shifts.some(
    (shift) =>
      salonTimeToInstant(input.date, shift.start, timezone) <= input.start &&
      end <= salonTimeToInstant(input.date, shift.end, timezone),
  );
  const offWork = input.timeOffs.some(
    (off) => off.start < end && input.start < off.end,
  );
  return inShift && !offWork;
}
