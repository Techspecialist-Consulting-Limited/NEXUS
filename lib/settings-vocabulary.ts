/*
 * Settings vocabulary — pure data, safe on either side of the boundary.
 *
 * Same split as roles.ts from auth.ts, and org-vocabulary.ts from
 * organization.ts: the module that reads these values opens a database
 * connection, and a client component importing one constant from it drags the
 * Postgres driver into the browser bundle. Nothing here imports anything.
 */

export const TIMEZONES = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Singapore",
  "UTC",
];

/** 0 → "12 midnight", 13 → "1 pm". Written the way somebody says it. */
export function hourLabel(hour: number): string {
  if (hour === 0) return "12 midnight";
  if (hour === 12) return "12 noon";
  return hour < 12 ? `${hour} am` : `${hour - 12} pm`;
}

export type PersonalSettings = {
  fullName: string;
  email: string;
  title: string | null;
  timezone: string;
  departmentName: string | null;
  leadName: string | null;
  quietHoursStart: number;
  quietHoursEnd: number;
  notifications: {
    nudges: boolean;
    weeklyDigest: boolean;
    email: boolean;
    inApp: boolean;
  };
  /** How they signed in, for the account section. */
  authProvider: string | null;
  joinedAt: string | null;
};
