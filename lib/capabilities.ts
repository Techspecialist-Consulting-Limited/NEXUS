import type { OrgRole } from "./roles";

/*
 * One person. One identity. Capabilities on top.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: everybody in the organisation is a
 * staff member. An administrator is a staff member. A department lead is a
 * staff member. HR is a staff member. They each get the ordinary personal
 * workspace — their own commitments, their own weekly update, their own
 * coaching — and additional capability appears on top of it.
 *
 * The Chairman is the single exception. He consumes organisational
 * intelligence and makes decisions; he does not file a weekly standup, and the
 * product deliberately excludes him from that workflow.
 *
 * WHY THIS IS DERIVED FROM `role` RATHER THAN STORED SEPARATELY
 *
 * `role` is what row-level security keys on: `current_org_role()` appears in
 * 27 policies, and it is the only thing standing between a lead and another
 * unit's reconciliations. A second, parallel privilege column would either
 * duplicate that — two sources of truth for the same question — or grant
 * capability the database does not enforce, which is a decorative permission
 * and worse than none.
 *
 * So `role` stays as the one capability the database understands, and this
 * file is the vocabulary the interface speaks. Nothing here is a security
 * boundary. A bug here shows somebody a link they cannot use; it never shows
 * them a row they may not read.
 *
 * KNOWN LIMIT: one additional capability per person.
 *
 * Somebody cannot currently be both "Organization Admin" and "HR Management".
 * Supporting that honestly means teaching RLS about a set rather than a
 * single value — a rewrite of every policy — and until that happens a
 * multi-select in the interface would be writing a promise the database does
 * not keep. `capabilitiesOf` returns an array specifically so that becoming a
 * set later is a change in one function rather than everywhere it is read.
 */

export type BaseIdentity = "staff" | "executive";

export type Capability =
  | "org_admin"
  | "people_admin"
  | "department_management"
  | "reporting_management"
  | "hr_management"
  | "department_lead"
  | "executive_access";

export const BASE_LABEL: Record<BaseIdentity, string> = {
  staff: "Staff",
  executive: "Executive",
};

export const CAPABILITY_LABEL: Record<Capability, string> = {
  org_admin: "Organization Admin",
  people_admin: "People Admin",
  department_management: "Department Management",
  reporting_management: "Reporting Management",
  hr_management: "HR Management",
  department_lead: "Department Lead",
  executive_access: "Executive Access",
};

/**
 * What each capability actually unlocks.
 *
 * Written for the Permissions page, and written from what the code and the
 * policies really do rather than from what sounds plausible. If a line here
 * cannot be traced to a route or a policy, it should not be here.
 */
export const CAPABILITY_DETAIL: Record<
  Capability,
  { allows: string; unlocks: string[]; reads: string; writes: boolean }
> = {
  org_admin: {
    allows: "Configure and operate the organisation.",
    unlocks: ["Administration", "Organization", "Permissions", "Reporting", "Audit log"],
    reads: "Everything in the organisation except the raw words of somebody else's check-in.",
    writes: true,
  },
  people_admin: {
    allows: "Invite people, place them, and change what they may see.",
    unlocks: ["People", "Invitations"],
    reads: "The roster, invitations, and each person's reporting status.",
    writes: true,
  },
  department_management: {
    allows: "Create, rename and archive units, and move people between them.",
    unlocks: ["Departments"],
    reads: "Every unit and its members.",
    writes: true,
  },
  reporting_management: {
    allows: "Set the reporting rhythm — when a week opens, closes and escalates.",
    unlocks: ["Reporting"],
    reads: "The reporting calendar and who has reported.",
    writes: true,
  },
  hr_management: {
    allows: "Own the reporting rhythm and follow up with people who have not reported.",
    unlocks: ["Overview", "Reporting compliance", "Units"],
    reads: "Who reported and when, across every unit. Never the raw words of a check-in.",
    writes: false,
  },
  department_lead: {
    allows: "Run a unit: see its week, its blockers and where it needs support.",
    unlocks: ["My team", "Department intelligence"],
    reads: "Their own unit's commitments, reconciliations and findings.",
    writes: false,
  },
  executive_access: {
    allows: "Read the organisation and ask NEXUS about it.",
    unlocks: ["Command", "Units", "Insights", "Alerts", "Ask NEXUS"],
    reads: "Organisation-wide figures and findings, with drill-down into any unit.",
    writes: false,
  },
};

/*
 * The mapping from the stored role to the vocabulary above.
 *
 * `admin` carries four capabilities because the Administrator really can do
 * all four things — they are named separately so the Permissions page can
 * explain what an administrator is, not because they can be granted apart.
 */
const CAPABILITIES: Record<OrgRole, Capability[]> = {
  staff: [],
  lead: ["department_lead"],
  hr: ["hr_management"],
  executive: ["executive_access"],
  admin: [
    "org_admin",
    "people_admin",
    "department_management",
    "reporting_management",
  ],
};

/** Staff for everybody but the Chairman. */
export function baseIdentityOf(role: OrgRole): BaseIdentity {
  return role === "executive" ? "executive" : "staff";
}

export function capabilitiesOf(role: OrgRole): Capability[] {
  return CAPABILITIES[role];
}

export function can(role: OrgRole, capability: Capability): boolean {
  return CAPABILITIES[role].includes(capability);
}

/**
 * Does this person have a personal week to report?
 *
 * Everybody but the Chairman. An administrator who cannot file their own
 * update is an administrator exempt from the thing they are asking everybody
 * else to do, and that is how a reporting culture starts being read as
 * something done TO people rather than with them.
 */
export function hasPersonalWorkspace(role: OrgRole): boolean {
  return baseIdentityOf(role) === "staff";
}

/** Anything under Administration. */
export function hasAdministration(role: OrgRole): boolean {
  return (
    can(role, "org_admin") ||
    can(role, "people_admin") ||
    can(role, "department_management") ||
    can(role, "reporting_management")
  );
}

/** A short description of somebody, for a roster row or a profile header. */
export function describeIdentity(role: OrgRole): string {
  const extras = capabilitiesOf(role);
  const base = BASE_LABEL[baseIdentityOf(role)];
  if (role === "admin") return `${base} · Organization Admin`;
  if (extras.length === 0) return base;
  return `${base} · ${CAPABILITY_LABEL[extras[0]]}`;
}
