import { describe, expect, it } from "vitest";
import {
  RoleGrantError,
  assertCanGrantRole,
  assertCanManageMember,
  canActOnMember,
  roleAtLeast,
} from "./access";

describe("roleAtLeast", () => {
  it("encodes owner > manager > viewer", () => {
    expect(roleAtLeast("owner", "manager")).toBe(true);
    expect(roleAtLeast("manager", "manager")).toBe(true);
    expect(roleAtLeast("viewer", "manager")).toBe(false);
    expect(roleAtLeast("viewer", "viewer")).toBe(true);
    expect(roleAtLeast(null, "viewer")).toBe(false);
  });
});

describe("canActOnMember (owner protection)", () => {
  it("lets owners act on anyone", () => {
    expect(canActOnMember("owner", "owner")).toBe(true);
    expect(canActOnMember("owner", "manager")).toBe(true);
    expect(canActOnMember("owner", "viewer")).toBe(true);
    expect(canActOnMember("owner", null)).toBe(true);
  });
  it("lets managers act on viewers/managers but NEVER on an owner", () => {
    expect(canActOnMember("manager", "viewer")).toBe(true);
    expect(canActOnMember("manager", "manager")).toBe(true);
    expect(canActOnMember("manager", "owner")).toBe(false);
  });
  it("never lets a viewer manage anyone", () => {
    expect(canActOnMember("viewer", "viewer")).toBe(false);
  });
});

describe("assertCanGrantRole", () => {
  it("allows an owner to grant any role", () => {
    expect(() => assertCanGrantRole("owner", null, "owner")).not.toThrow();
    expect(() => assertCanGrantRole("owner", "viewer", "manager")).not.toThrow();
  });
  it("caps a manager-issued grant at manager and blocks owner grants", () => {
    expect(() => assertCanGrantRole("manager", null, "manager")).not.toThrow();
    expect(() => assertCanGrantRole("manager", null, "viewer")).not.toThrow();
    expect(() => assertCanGrantRole("manager", null, "owner")).toThrow(RoleGrantError);
  });
  it("blocks a manager from changing an owner's role", () => {
    expect(() => assertCanGrantRole("manager", "owner", "manager")).toThrow(RoleGrantError);
  });
  it("blocks granting above your own rank", () => {
    expect(() => assertCanGrantRole("viewer", null, "manager")).toThrow(RoleGrantError);
  });
});

describe("assertCanManageMember", () => {
  it("throws when a manager targets an owner", () => {
    expect(() => assertCanManageMember("manager", "owner")).toThrow(RoleGrantError);
    expect(() => assertCanManageMember("owner", "owner")).not.toThrow();
    expect(() => assertCanManageMember("manager", "manager")).not.toThrow();
  });
});
