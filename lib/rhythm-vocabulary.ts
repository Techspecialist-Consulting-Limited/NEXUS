/*
 * Rhythm vocabulary — pure data, safe on either side of the boundary.
 *
 * Same split as roles.ts from auth.ts and org-vocabulary.ts from
 * organization.ts: lib/rhythm.ts opens a database connection, and a client
 * component importing one constant from it drags the Postgres driver into the
 * browser bundle. Nothing here imports anything.
 */

export type RhythmConfig = {
  /** ISO weekday, 1 = Monday. The day the week's check-in opens. */
  promptDay: number;
  promptHour: number;
  /** Same day as the prompt, later. Chases whoever has not answered. */
  reminderHour: number;
  /** ISO weekday. Usually the Monday after the week being reported. */
  digestDay: number;
  digestHour: number;
  /** Hours somebody has to correct their own reconciliation before it rolls up. */
  reviewWindowHours: number;
  /** The most NEXUS will send one person in a day, across every kind. */
  maxNudgesPerDay: number;
  /**
   * The first week this organisation reports on, as YYYY-MM-DD. Null means
   * "since the organisation was created".
   *
   * Reconciliation walks weeks forward from here. Without it the job had to
   * guess a window — three weeks, chosen for no reason — which both missed
   * history an organisation genuinely wanted counted and reached back into
   * weeks from before anybody was using NEXUS, where "nobody reported" is an
   * artefact of the software not existing yet rather than a fact about anyone.
   */
  reportingStartsOn: string | null;
};

export const DAY_NAME: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};
