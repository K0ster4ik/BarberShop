import { describe, expect, it } from "vitest";
import { navItemsFor } from "@/components/admin/nav-items";
import {
  assertOwnMaster,
  bookingScope,
  canAccess,
  canOpenSection,
  clientScope,
  ForbiddenError,
  masterScope,
  safeAdminPath,
  type StaffUser,
} from "@/server/auth/access";

const owner: StaffUser = {
  id: "u-owner",
  name: "Владелец",
  email: "owner@example.com",
  role: "OWNER",
  masterId: null,
};
const admin: StaffUser = { ...owner, id: "u-admin", role: "ADMIN" };
const master: StaffUser = {
  ...owner,
  id: "u-master",
  role: "MASTER",
  masterId: "m-1",
};
const unlinkedMaster: StaffUser = { ...master, masterId: null };

describe("section access (DESIGN.md, section 4)", () => {
  it("gives analytics to the owner and to masters (own revenue), not to admins", () => {
    expect(canOpenSection(owner, "analytics")).toBe(true);
    expect(canOpenSection(master, "analytics")).toBe(true);
    expect(canOpenSection(admin, "analytics")).toBe(false);
  });

  it("lets only the owner manage users", () => {
    expect(canOpenSection(owner, "users")).toBe(true);
    expect(canOpenSection(admin, "users")).toBe(false);
    expect(canOpenSection(master, "users")).toBe(false);
  });

  it("keeps services and promo codes for managers", () => {
    for (const section of ["services", "promoCodes"] as const) {
      expect(canOpenSection(owner, section)).toBe(true);
      expect(canOpenSection(admin, section)).toBe(true);
      expect(canOpenSection(master, section)).toBe(false);
    }
  });

  it("denies everything to a master without a linked master card", () => {
    expect(canAccess(unlinkedMaster, ["OWNER", "ADMIN", "MASTER"])).toBe(false);
  });

  it("builds the menu from the same rules", () => {
    expect(navItemsFor("OWNER")).toHaveLength(9);
    expect(navItemsFor("ADMIN").map((item) => item.section)).not.toContain(
      "analytics",
    );
    expect(navItemsFor("MASTER").map((item) => item.section)).toEqual([
      "today",
      "calendar",
      "bookings",
      "clients",
      "masters",
      "analytics",
    ]);
  });
});

describe("ownership", () => {
  it("lets a master touch only their own card", () => {
    expect(() => assertOwnMaster(master, "m-1")).not.toThrow();
    expect(() => assertOwnMaster(master, "m-2")).toThrow(ForbiddenError);
    expect(() => assertOwnMaster(unlinkedMaster, "m-1")).toThrow(
      ForbiddenError,
    );
  });

  it("does not restrict owners and admins", () => {
    expect(() => assertOwnMaster(owner, "m-2")).not.toThrow();
    expect(() => assertOwnMaster(admin, "m-2")).not.toThrow();
  });

  it("scopes queries to the master's own rows", () => {
    expect(bookingScope(master)).toEqual({ masterId: "m-1" });
    expect(masterScope(master)).toEqual({ id: "m-1" });
    expect(clientScope(master)).toEqual({
      bookings: { some: { masterId: "m-1", deletedAt: null } },
    });
    expect(bookingScope(admin)).toEqual({});
    expect(clientScope(owner)).toEqual({});
    expect(() => bookingScope(unlinkedMaster)).toThrow(ForbiddenError);
  });
});

describe("safeAdminPath", () => {
  it("keeps paths inside the admin area", () => {
    expect(safeAdminPath("/admin/clients")).toBe("/admin/clients");
    expect(safeAdminPath("/admin/clients?tag=VIP")).toBe(
      "/admin/clients?tag=VIP",
    );
    expect(safeAdminPath("/admin")).toBe("/admin");
  });

  it("falls back to the admin home for anything else", () => {
    for (const next of [
      null,
      undefined,
      "",
      "https://evil.example",
      "//evil.example/admin",
      "/administrator",
      "/admin\\evil",
      "/admin/login",
      "/",
    ]) {
      expect(safeAdminPath(next)).toBe("/admin");
    }
  });
});
