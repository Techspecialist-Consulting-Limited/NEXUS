/*
 * Organisation vocabulary — pure data, safe on either side of the boundary.
 *
 * Deliberately separate from lib/organization.ts, for exactly the reason
 * lib/roles.ts is separate from lib/auth.ts: that module opens a database
 * connection, and a client component importing a weekday label from it drags
 * the Postgres driver into the browser bundle.
 *
 * That is not theoretical. It is how this file came to exist — the
 * organisation form imported one constant and the build failed with
 * "Module not found: Can't resolve 'fs'", which is Turbopack telling you a
 * server module reached a client one. Nothing here imports anything.
 */

/** ISO weekday numbers, 1 = Monday. Monday to Friday is the default. */
export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

export const WEEKDAY_LABEL: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

export type OrganizationProfile = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  industry: string | null;
  country: string | null;
  /** ISO weekday numbers, 1 = Monday. */
  workingDays: number[];
  onboardingComplete: boolean;
};
