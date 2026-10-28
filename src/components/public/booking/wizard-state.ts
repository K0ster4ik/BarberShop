import { ANY_MASTER, bookingSelectionShape } from "@/lib/validation/booking";

// Состояние мастера записи живёт в адресе (DESIGN.md, 7.1): ссылку можно переслать,
// кнопка «назад» браузера возвращает на прошлый шаг. Контакты в адрес не попадают.

export const STEPS = [
  { id: "services", label: "Услуги" },
  { id: "master", label: "Мастер" },
  { id: "time", label: "Дата и время" },
  { id: "contacts", label: "Контакты" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

export type WizardState = {
  step: StepId;
  serviceIds: string[];
  masterId: string | null; // id или ANY_MASTER
  date: string | null;
  time: string | null;
};

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Разбирает адрес. Неверные значения отбрасываются, а шаг не может обогнать данные:
 * без услуг — шаг услуг, без мастера — шаг мастера и так далее.
 */
export function parseWizardState(params: SearchParams): WizardState {
  const services = bookingSelectionShape.serviceIds.safeParse(
    (single(params.services) ?? "").split(",").filter(Boolean),
  );
  const master = bookingSelectionShape.masterId.safeParse(
    single(params.master),
  );
  const date = bookingSelectionShape.date.safeParse(single(params.date));
  const time = bookingSelectionShape.time.safeParse(single(params.time));

  const state: WizardState = {
    step: "services",
    serviceIds: services.success ? services.data : [],
    masterId: services.success && master.success ? master.data : null,
    date: date.success ? date.data : null,
    time: date.success && time.success ? time.data : null,
  };
  const requested = STEPS.findIndex(({ id }) => id === single(params.step));
  const reachable = !state.serviceIds.length
    ? 0
    : !state.masterId
      ? 1
      : !state.time
        ? 2
        : 3;
  const index = Math.min(requested < 0 ? reachable : requested, reachable);
  return { ...state, step: STEPS[index]?.id ?? "services" };
}

/** Адрес шага. Значения прошлых шагов сохраняются, чтобы «назад» их не терял. */
export function wizardHref(state: Partial<WizardState> & { step: StepId }) {
  const params = new URLSearchParams({ step: state.step });
  if (state.serviceIds?.length)
    params.set("services", state.serviceIds.join(","));
  if (state.masterId) params.set("master", state.masterId);
  if (state.date) params.set("date", state.date);
  if (state.time) params.set("time", state.time);
  return `/book?${params.toString()}`;
}

export { ANY_MASTER };
