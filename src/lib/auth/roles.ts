export type Role =
  | "PLATFORM_ADMIN"
  | "ORG_OWNER"
  | "ORG_ADMIN"
  | "CAPTAIN"
  | "PLAYER"
  | "GUEST";

export type Action =
  | "tournament:create"
  | "tournament:read"
  | "tournament:update"
  | "tournament:delete"
  | "tournament:cancel"
  | "registration:create"
  | "registration:approve"
  | "registration:read"
  | "registration:manage"
  | "squad:create"
  | "squad:manage"
  | "squad:read"
  | "fixtures:generate"
  | "fixtures:publish"
  | "fixtures:reschedule"
  | "results:enter"
  | "results:edit"
  | "results:bulk"
  | "dispute:create"
  | "dispute:resolve"
  | "prizes:declare"
  | "prizes:pay"
  | "prizes:read"
  | "org:update"
  | "org:manageMembers"
  | "org:changeBankDetails"
  | "admin:*"
  | "announcements:send";

const ROLE_HIERARCHY: Record<Role, number> = {
  PLATFORM_ADMIN: 100,
  ORG_OWNER: 80,
  ORG_ADMIN: 60,
  CAPTAIN: 40,
  PLAYER: 20,
  GUEST: 0,
};

const ROLE_PERMISSIONS: Record<Role, Action[]> = {
  PLATFORM_ADMIN: ["admin:*"],
  ORG_OWNER: [
    "tournament:create",
    "tournament:read",
    "tournament:update",
    "tournament:delete",
    "tournament:cancel",
    "registration:approve",
    "registration:read",
    "registration:manage",
    "squad:create",
    "squad:manage",
    "squad:read",
    "fixtures:generate",
    "fixtures:publish",
    "fixtures:reschedule",
    "results:enter",
    "results:edit",
    "results:bulk",
    "dispute:resolve",
    "prizes:declare",
    "prizes:pay",
    "prizes:read",
    "org:update",
    "org:manageMembers",
    "org:changeBankDetails",
    "announcements:send",
  ],
  ORG_ADMIN: [
    "tournament:create",
    "tournament:read",
    "tournament:update",
    "tournament:delete",
    "tournament:cancel",
    "registration:approve",
    "registration:read",
    "registration:manage",
    "squad:create",
    "squad:manage",
    "squad:read",
    "fixtures:generate",
    "fixtures:publish",
    "fixtures:reschedule",
    "results:enter",
    "results:edit",
    "results:bulk",
    "dispute:resolve",
    "prizes:declare",
    "prizes:pay",
    "prizes:read",
    "org:update",
    "org:manageMembers",
    "announcements:send",
  ],
  CAPTAIN: [
    "tournament:read",
    "registration:create",
    "registration:read",
    "squad:read",
    "squad:manage",
  ],
  PLAYER: [
    "tournament:read",
    "registration:create",
    "registration:read",
    "dispute:create",
    "prizes:read",
  ],
  GUEST: ["tournament:read", "prizes:read"],
};

export interface ActorContext {
  userId: string;
  role: Role;
  orgId?: string;
}

/**
 * Asserts that the actor can perform the given action on the given resource.
 * Throws an AuthError on access denial.
 */
export function assertCan(
  actor: ActorContext,
  action: Action,
  resourceOrgId?: string,
): void {
  const permissions = ROLE_PERMISSIONS[actor.role] ?? [];

  // PLATFORM_ADMIN can do anything
  if (actor.role === "PLATFORM_ADMIN") return;

  // Check action permission
  const hasAction = permissions.some((p) => {
    if (p === "admin:*") return true;
    if (p === action) return true;
    // Wildcard check
    const [category] = action.split(":");
    return p === `${category}:*`;
  });

  if (!hasAction) {
    throw new AuthError(
      `Role ${actor.role} cannot perform action ${action}`,
      403,
    );
  }

  // Check org-level tenancy for org-scoped actions. A missing actor.orgId is
  // NOT an exemption — an actor with no organization must be denied access
  // to a specific org's resource just as much as an actor from a different
  // org (§11: "An ORG_ADMIN of org A cannot read or mutate anything
  // belonging to org B"). Only checking `actor.orgId && ...` here would
  // silently allow through any actor with no orgId set at all.
  if (resourceOrgId) {
    const exemptActions: Action[] = [
      "tournament:read",
      "registration:create",
      "prizes:read",
    ];
    if (!exemptActions.includes(action) && actor.orgId !== resourceOrgId) {
      throw new AuthError(
        `Cross-organization access denied`,
        403,
      );
    }
  }
}

export function getRoleLevel(role: Role): number {
  return ROLE_HIERARCHY[role] ?? 0;
}

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number = 403) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}