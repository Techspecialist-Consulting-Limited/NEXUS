import type { OrgRole } from "./roles";
import { can, hasAdministration, hasPersonalWorkspace } from "./capabilities";

/*
 * Navigation follows CAPABILITY, not a hard-coded role.
 *
 * The rule this file now obeys — see lib/capabilities.ts — is that everybody
 * is a staff member and capability is layered on top. So the rail is built by
 * asking what a person can do, not by looking up which of five boxes they are
 * in. An administrator gets the personal section AND Administration; a lead
 * gets the personal section AND their team; the Chairman is the one genuinely
 * different experience.
 *
 * That fixed a real hole. The Administrator had no /my-week and no /check-in
 * at all: they configured a reporting rhythm they could not personally take
 * part in, and signing in as one landed on a command view that said "no
 * settled weeks yet" and offered nothing else.
 *
 * `icon` is a KEY, not a component. This config crosses the server/client
 * boundary into the nav, and a Lucide icon is a function, which React cannot
 * serialise. The client resolves the key.
 *
 * NONE OF THIS IS SECURITY. Row-level security decides what a person may read.
 * A mistake here shows somebody a link that will bounce them; it never shows
 * them a row they may not see. Every page behind these links checks again on
 * the server.
 */

export type IconKey =
  | "command"
  | "units"
  | "insights"
  | "alerts"
  | "myweek"
  | "tasks"
  | "checkin"
  | "people"
  | "admin"
  | "org"
  | "shield"
  | "clock"
  | "history"
  | "settings"
  | "plug";

/** Sections in the sidebar. `personal` is unlabelled — it is simply the top. */
export type NavGroup = "personal" | "team" | "admin" | "account";

export type Tab = {
  href: string;
  label: string;
  icon: IconKey;
  /** Defaults to `personal`. */
  group?: NavGroup;
};

export const GROUP_LABEL: Record<Exclude<NavGroup, "personal">, string> = {
  team: "Team",
  admin: "Administration",
  /*
   * Unlabelled in the rail. "You" as a heading above a single "Settings" row
   * is a section title longer than its section — the separator above it says
   * everything the heading would.
   */
  account: "",
};

/** The personal workspace every staff member has, in the order they use it. */
function personalTabs(): Tab[] {
  return [
    { href: "/my-week", label: "My week", icon: "myweek" },
    { href: "/commitments", label: "Tasks", icon: "tasks" },
    { href: "/check-in", label: "Check in", icon: "checkin" },
    { href: "/advice", label: "Coaching", icon: "insights" },
    { href: "/notifications", label: "Alerts", icon: "alerts" },
  ];
}

export function tabsFor(role: OrgRole): Tab[] {
  /*
   * The Chairman reads; he does not administer and he does not file. PRD F17:
   * his signed-in view is read-only and carries no administrative capability.
   */
  if (role === "executive") {
    return [
      { href: "/dashboard", label: "Command", icon: "command" },
      { href: "/departments", label: "Units", icon: "units" },
      { href: "/advice", label: "Insights", icon: "insights" },
      { href: "/notifications", label: "Alerts", icon: "alerts" },
      { href: "/settings", label: "Settings", icon: "settings", group: "account" },
    ];
  }

  const tabs: Tab[] = hasPersonalWorkspace(role) ? personalTabs() : [];

  /*
   * A lead's own week comes first and their unit second. A lead who stops
   * reporting is a lead whose unit learns that reporting is optional.
   */
  if (can(role, "department_lead")) {
    tabs.push({ href: "/my-team", label: "My team", icon: "people", group: "team" });
  }

  /*
   * HR both monitors and reports. They enforce the rhythm and they are also a
   * member of the organisation with their own week, so the rail carries both
   * halves — a monitoring-only HR is the one seat exempt from the thing it
   * enforces.
   */
  if (can(role, "hr_management")) {
    tabs.push(
      { href: "/dashboard", label: "Overview", icon: "command", group: "team" },
      { href: "/compliance", label: "Reporting", icon: "people", group: "team" },
      { href: "/departments", label: "Units", icon: "units", group: "team" },
    );
  }

  if (hasAdministration(role)) {
    tabs.push(
      { href: "/admin", label: "Organization", icon: "org", group: "admin" },
      { href: "/admin/people", label: "People", icon: "people", group: "admin" },
      { href: "/admin/departments", label: "Departments", icon: "units", group: "admin" },
      { href: "/admin/permissions", label: "Permissions", icon: "shield", group: "admin" },
      { href: "/admin/reporting", label: "Reporting", icon: "clock", group: "admin" },
      { href: "/admin/integrations", label: "Integrations", icon: "plug", group: "admin" },
      { href: "/admin/audit", label: "Audit log", icon: "history", group: "admin" },
    );
  }

  /*
   * Settings sits in its own group at the foot of the rail, not in the
   * personal list. It is where you go when something about YOU is wrong —
   * a different kind of destination from the five places you work — and
   * grouping it with them buries it in the middle of a list.
   */
  tabs.push({ href: "/settings", label: "Settings", icon: "settings", group: "account" });

  return tabs;
}

/*
 * The centre button on the phone bar.
 *
 * A raised circle between the tabs, and the way you talk to NEXUS. It is an
 * ACTION, not a fifth destination — which is why it does not carry a label and
 * never shows as the current page.
 *
 * WHAT IT OPENS DEPENDS ON WHAT YOU DO HERE.
 *
 * For anybody who files a week, talking to NEXUS means telling it what
 * happened, so it opens the quick voice check-in on their own home screen and
 * starts listening. It REPLACES the "Check in" tab rather than sitting beside
 * it: two entry points to the same act, one of them four times the size, is a
 * question the interface should not be asking.
 *
 * For the Chairman, talking to NEXUS means asking it something, so it opens
 * the assistant and starts listening.
 *
 * `?ask=1` is read once by the surface it lands on and stripped from the URL,
 * so a refresh does not re-open the microphone.
 */
export type Launcher = {
  href: string;
  /** The accessible name. There is no visible label. */
  label: string;
  /** A tab this replaces on phones. It stays in the desktop sidebar. */
  replaces?: string;
};

export function launcherFor(role: OrgRole): Launcher | null {
  if (role === "executive") {
    return { href: "/dashboard?ask=1", label: "Ask NEXUS" };
  }
  if (hasPersonalWorkspace(role)) {
    return { href: "/my-week?ask=1", label: "Voice check-in", replaces: "/check-in" };
  }
  return null;
}

/**
 * Where "/" sends each role.
 *
 * The Chairman lands on the command view. Everybody else lands in their own
 * workspace, including the Administrator: Administration is a place they go
 * to, not the place they live.
 */
export function homeFor(role: OrgRole): string {
  if (role === "executive") return "/dashboard";
  return "/my-week";
}
