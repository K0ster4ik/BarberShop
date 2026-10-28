import { describe, expect, it } from "vitest";
import {
  parseWizardState,
  wizardHref,
} from "@/components/public/booking/wizard-state";

const A = "cho5mjvx75gsdnr40n08e96s5";
const B = "c7h68v0x9sv3mp8rvd3cwd31i";

describe("parseWizardState", () => {
  it("starts with services when the address is empty", () => {
    expect(parseWizardState({})).toEqual({
      step: "services",
      serviceIds: [],
      masterId: null,
      date: null,
      time: null,
    });
  });

  it("never lets the step run ahead of what is chosen", () => {
    // Просят шаг контактов, а мастер не выбран — показываем шаг мастера
    expect(
      parseWizardState({ step: "contacts", services: `${A},${B}` }).step,
    ).toBe("master");
    expect(
      parseWizardState({
        step: "contacts",
        services: A,
        master: "any",
        date: "2026-11-04",
      }).step,
    ).toBe("time");
  });

  it("goes back to an earlier step without losing later choices", () => {
    const state = parseWizardState({
      step: "master",
      services: A,
      master: B,
      date: "2026-11-04",
      time: "14:15",
    });
    expect(state).toMatchObject({ step: "master", masterId: B, time: "14:15" });
  });

  it("drops values that are not ids, dates or times", () => {
    expect(
      parseWizardState({
        step: "time",
        services: `${A},<script>`,
        master: "DROP TABLE",
        date: "2026-02-31",
        time: "25:00",
      }),
    ).toEqual({
      step: "services",
      serviceIds: [],
      masterId: null,
      date: null,
      time: null,
    });
  });
});

describe("wizardHref", () => {
  it("round-trips through the address", () => {
    const state = {
      step: "contacts" as const,
      serviceIds: [A, B],
      masterId: "any",
      date: "2026-11-04",
      time: "14:15",
    };
    const query = Object.fromEntries(
      new URL(wizardHref(state), "http://x").searchParams,
    );
    expect(parseWizardState(query)).toEqual(state);
  });
});
