// ─── RBAC / assertCan Tests (§11, §14) ───────────────────────
// "A missing guard is the most likely serious bug in this codebase."
import { describe, it, expect } from "vitest";
import { assertCan, AuthError, type ActorContext } from "@/lib/auth/roles";

describe("assertCan — authorization (§14)", () => {
  it("an ORG_ADMIN of org A cannot mutate a resource belonging to org B", () => {
    const actor: ActorContext = { userId: "u1", role: "ORG_ADMIN", orgId: "org_A" };
    expect(() => assertCan(actor, "results:enter", "org_B")).toThrow(AuthError);
  });

  it("an actor with no orgId at all cannot mutate an org-scoped resource", () => {
    // This is the regression case: orgId undefined must NOT be treated as
    // an implicit exemption from the tenancy check.
    const actor: ActorContext = { userId: "u1", role: "ORG_ADMIN" };
    expect(() => assertCan(actor, "results:enter", "org_B")).toThrow(AuthError);
  });

  it("an ORG_ADMIN can mutate a resource belonging to their own org", () => {
    const actor: ActorContext = { userId: "u1", role: "ORG_ADMIN", orgId: "org_A" };
    expect(() => assertCan(actor, "results:enter", "org_A")).not.toThrow();
  });

  it("a CAPTAIN cannot enter results", () => {
    const actor: ActorContext = { userId: "u1", role: "CAPTAIN", orgId: "org_A" };
    expect(() => assertCan(actor, "results:enter", "org_A")).toThrow(AuthError);
  });

  it("a PLAYER cannot approve registrations", () => {
    const actor: ActorContext = { userId: "u1", role: "PLAYER" };
    expect(() => assertCan(actor, "registration:approve")).toThrow(AuthError);
  });

  it("an ORG_ADMIN cannot change payout bank details (owner-only)", () => {
    const actor: ActorContext = { userId: "u1", role: "ORG_ADMIN", orgId: "org_A" };
    expect(() => assertCan(actor, "org:changeBankDetails", "org_A")).toThrow(AuthError);
  });

  it("an ORG_OWNER can change payout bank details for their own org", () => {
    const actor: ActorContext = { userId: "u1", role: "ORG_OWNER", orgId: "org_A" };
    expect(() => assertCan(actor, "org:changeBankDetails", "org_A")).not.toThrow();
  });

  it("PLATFORM_ADMIN bypasses tenancy checks entirely", () => {
    const actor: ActorContext = { userId: "admin", role: "PLATFORM_ADMIN" };
    expect(() => assertCan(actor, "org:changeBankDetails", "org_B")).not.toThrow();
  });

  it("cross-org tournament reads and registration creation are exempt (public actions)", () => {
    const actor: ActorContext = { userId: "u1", role: "PLAYER" };
    expect(() => assertCan(actor, "tournament:read", "org_B")).not.toThrow();
    expect(() => assertCan(actor, "registration:create", "org_B")).not.toThrow();
  });
});
