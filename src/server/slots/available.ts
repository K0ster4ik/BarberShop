import type { SalonSettings } from "@/config/salon";
import {
  addDays,
  type DateString,
  salonTimeToInstant,
  toSalonDate,
} from "@/lib/time";

// Свободное время мастера на один день (DESIGN.md, раздел 6). Чистая функция: всё нужное
// приходит на вход, в БД она не ходит. Внутри время — миллисекунды UTC.

/** Полуинтервал [start, end). */
export type Interval = { start: Date; end: Date };

export type SlotsInput = {
  date: DateString; // день по часам салона
  durationMin: number; // длительность выбранных услуг у этого мастера
  bufferMin: number; // уборка после записи
  workingHours: readonly { startMin: number; endMin: number }[]; // график на этот день недели
  timeOffs: readonly Interval[];
  bookings: readonly Interval[]; // активные записи [startsAt, blockedUntil)
  now: Date;
  settings: Pick<
    SalonSettings,
    "timezone" | "slotStepMin" | "minLeadTimeMin" | "bookingHorizonDays"
  >;
};

type Span = { start: number; end: number };

const MINUTE = 60_000;

/** Время начала свободных слотов (UTC), по возрастанию и без повторов. */
export function getAvailableSlots(input: SlotsInput): Date[] {
  const { date, settings } = input;
  assertMinutes(input.durationMin, 1, "durationMin");
  assertMinutes(input.bufferMin, 0, "bufferMin");

  // Горизонт записи — bookingHorizonDays дней, считая сегодняшний.
  const today = toSalonDate(input.now, settings.timezone);
  const lastDay = addDays(today, settings.bookingHorizonDays - 1);
  if (date < today || date > lastDay) return [];

  const duration = input.durationMin * MINUTE;
  const buffer = input.bufferMin * MINUTE;
  const step = settings.slotStepMin * MINUTE;
  const earliest = input.now.getTime() + settings.minLeadTimeMin * MINUTE;
  // Сетка считается от полуночи салона, а не от эпохи UTC: так она совпадает с часами
  // на стене. Переход на летнее время сдвигает время на час — сетке это не мешает,
  // пока шаг делит 30 минут.
  const midnight = salonTimeToInstant(date, 0, settings.timezone).getTime();

  const busy = [...input.timeOffs, ...input.bookings]
    .map(toSpan)
    .sort((a, b) => a.start - b.start);
  // Уборка не должна залезать на чужую запись или отсутствие. За конец смены — можно:
  // уборка после закрытия или перед обедом допустима.
  const fits = (start: number) => {
    const end = start + duration + buffer;
    return !busy.some((span) => span.start < end && start < span.end);
  };

  const result = new Set<number>();
  for (const free of freeSpans(shifts(input), busy)) {
    // Начало свободного окна — тоже кандидат: после записи нестандартной длины
    // следующий клиент может прийти сразу, а не ждать ближайшей отметки сетки.
    const firstOnGrid =
      midnight + Math.ceil((free.start - midnight) / step) * step;
    const candidates = [free.start];
    for (let start = firstOnGrid; start + duration <= free.end; start += step) {
      candidates.push(start);
    }
    for (const start of candidates) {
      if (start >= earliest && start + duration <= free.end && fits(start)) {
        result.add(start);
      }
    }
  }
  return [...result].sort((a, b) => a - b).map((time) => new Date(time));
}

function assertMinutes(value: number, min: number, name: string): void {
  if (!Number.isInteger(value) || value < min) {
    throw new RangeError(`${name} must be an integer >= ${min}: ${value}`);
  }
}

function toSpan(interval: Interval): Span {
  return { start: interval.start.getTime(), end: interval.end.getTime() };
}

/** Рабочие интервалы дня; соприкасающиеся склеиваются (10–12 и 12–14 — одна смена). */
function shifts({ date, workingHours, settings }: SlotsInput): Span[] {
  const spans = workingHours
    .map((hours) => ({
      start: salonTimeToInstant(
        date,
        hours.startMin,
        settings.timezone,
      ).getTime(),
      end: salonTimeToInstant(date, hours.endMin, settings.timezone).getTime(),
    }))
    .sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

/** Рабочие интервалы минус занятое время. `busy` отсортирован по началу. */
function freeSpans(work: readonly Span[], busy: readonly Span[]): Span[] {
  const free: Span[] = [];
  for (const shift of work) {
    let cursor = shift.start;
    for (const span of busy) {
      if (span.end <= cursor) continue;
      if (span.start >= shift.end) break;
      if (span.start > cursor) free.push({ start: cursor, end: span.start });
      cursor = Math.max(cursor, span.end);
    }
    if (cursor < shift.end) free.push({ start: cursor, end: shift.end });
  }
  return free;
}
