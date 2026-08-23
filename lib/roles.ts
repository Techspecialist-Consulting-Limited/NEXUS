/*
 * The role vocabulary — pure data, safe on either side of the boundary.
 *
 * Deliberately separate from lib/auth.ts. That module opens a database
 * connection, and a client component importing a label from it drags the
 * Postgres driver into the browser bundle (which is exactly how this file came
 * to exist). Nothing here imports anything.
 */

export type OrgRole = "staff" | "lead" | "hr" | "executive" | "admin";
export type MembershipStatus = "invited" | "pending" | "active" | "suspended";

export const ROLE_LABEL: Record<OrgRole, string> = {
  staff: "Team member",
  lead: "Unit lead",
  hr: "HR",
  executive: "Chairman",
  admin: "Administrator",
};

export const ROLE_BLURB: Record<OrgRole, string> = {
  staff: "Files a weekly standup and sees their own week.",
  lead: "Everything a team member has, plus their unit's standups.",
  hr: "Sees the whole organisation and who reported. Owns the reporting rhythm.",
  executive: "Reads the digest and drills into any unit, project or week.",
  admin: "Manages accounts, units, invitations and the reporting calendar.",
};

/*
 * Read-side role questions.
 *
 * These decide what the INTERFACE offers. They are not the security boundary —
 * RLS is — so a bug here shows somebody a link they cannot use, rather than
 * data they should not see. Keeping that distinction sharp is why none of
 * these ever gates a query.
 */

export const isChairman = (r: OrgRole) => r === "executive" || r === "admin";
export const isHr = (r: OrgRole) => r === "hr";
export const canSeeOrg = (r: OrgRole) => isChairman(r) || isHr(r);

/*
 * Only the Administrator manages people. PRD F17: the Chairman's signed-in
 * view is read-only and carries no administrative capability — he reads the
 * organisation, he does not decide who may read it.
 */
export const canManagePeople = (r: OrgRole) => r === "admin";

export const canLeadUnit = (r: OrgRole) => r === "lead" || canSeeOrg(r);

/*
 * Everybody files a standup except the Chairman.
 *
 * This used to be staff and leads only, which left the Administrator and HR
 * managing a reporting rhythm they were personally exempt from. An admin who
 * cannot file their own update is an admin asking everybody else to do
 * something they do not do, and that is how weekly reporting starts being read
 * as something done TO people.
 *
 * The Chairman remains out: he consumes organisational intelligence and makes
 * decisions, and the product deliberately excludes him from the workflow. See
 * lib/capabilities.ts, which owns this rule.
 */
export const submitsStandups = (r: OrgRole) => r !== "executive";
