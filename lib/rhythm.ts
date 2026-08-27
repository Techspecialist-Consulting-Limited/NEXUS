import { asActor, asService } from "./db";
import {
  DAY_NAME,
  describeCadence,
  type DigestCadence,
  type RhythmConfig,
} from "./rhythm-vocabulary";

export { DAY_NAME, describeCadence };
export type { RhythmConfig, DigestCadence };

/*
 * When each part of the reporting rhythm is allowed to run.
 *
 * THE PROBLEM THIS SOLVES. NEXUS did not decide its own timing: something
 * outside it called POST /api/cron/tick and every job ran, in order, whenever
 * that happened. So an administrator asking "when does the week open?" could
 * only be answered with "whenever your scheduler fires", and a Reporting page
 * offering a time picker would have been storing a preference nothing read.
 *
 * The fix is a gate rather than a scheduler. The tick can fire as often as it
 * likes, and each job runs only once the organisation's own configured moment
 * has arrived.
 *
 * WHAT CHANGED, AND WHY IT HAD TO
 *
 * The gate used to answer one question — "is it at or after Monday 9?" — and
 * that made every job weekly, hour-grained, and impossible to ask for now.
 * A pilot that wanted the Chairman briefed twenty minutes after people
 * reported had no setting to express it, and the honest answer to "when will
 * he see this?" was "sometime within the hour".
 *
 * So the brief now carries a CADENCE (weekly, daily, every N minutes, or never
 * without being asked) and an optional ONE-OFF instant, and the gate compares
 * both against when a brief was last actually delivered.
 *
 * WHY LAST-DELIVERED, RATHER THAN AT-OR-AFTER
 *
 * At-or-after stayed true for the rest of the week once a moment passed. That
 * was survivable only because the digest table has a unique key per cycle, so
 * a second run updated one row instead of sending twice — the idempotency was
 * real but it was accidental, and it made "every twenty minutes" express
 * itself as "once, then silence".
 *
 * Comparing against the last delivery says exactly what was meant: a moment is
 * due if it has arrived and nothing has been delivered since it. That is still
 * at-or-after — a tick that misses its window catches up rather than skipping
 * the week — and it now also closes behind itself, which is what makes a
 * repeating cadence possible at all.
 *
 * AN EXPLICIT ?job= CALL IGNORES THE GATE ENTIRELY. That is the manual run: an
 * administrator asking for the brief now means now, and a "send it" button that
 * silently declined because it was Tuesday would be the worst control in the
 * product.
 */

export const RHYTHM_DEFAULTS: RhythmConfig = {
  promptDay: 5, // Friday
  promptHour: 15,
  promptMinute: 0,
  reminderHour: 17,
  reminderMinute: 0,
  digestCadence: { kind: "weekly", day: 1, hour: 9, minute: 0 }, // Monday 09:00
  briefCurrentCycle: false,
  reviewWindowMinutes: 24 * 60,
  maxNudgesPerDay: 2,
  nextDigestAt: null,
  reportingStartsOn: null,
};

/**
 * A calendar date, or null.
 *
 * Only YYYY-MM-DD. Anything else is treated as unset rather than coerced,
 * because a half-parsed date here would silently change which weeks the
 * organisation is reconciled from — and a wrong answer about that is worse
 * than falling back to when the organisation was created.
 */
function day(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : t;
}

/** An ISO instant, or null. Same refusal-to-coerce rule as `day`. */
function instant(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * Read the cadence, migrating an organisation that predates it.
 *
 * Every organisation in the database was configured with `exec_digest_day` and
 * `exec_digest_hour`, and those two keys are still what a deployment mid-rollout
 * will find. Reading them as a weekly cadence means the change ships without a
 * migration and without a moment where somebody's brief stops going out because
 * the key it lived under was renamed.
 */
function readCadence(settings: Record<string, unknown>): DigestCadence {
  const raw = settings.exec_digest_cadence;

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const c = raw as Record<string, unknown>;
    switch (c.kind) {
      case "manual":
        return { kind: "manual" };
      case "interval":
        return { kind: "interval", minutes: int(c.minutes, 60, 5, 10080) };
      case "daily":
        return {
          kind: "daily",
          hour: int(c.hour, 9, 0, 23),
          minute: int(c.minute, 0, 0, 59),
        };
      case "weekly":
        return {
          kind: "weekly",
          day: int(c.day, 1, 1, 7),
          hour: int(c.hour, 9, 0, 23),
          minute: int(c.minute, 0, 0, 59),
        };
    }
  }

  // No cadence stored: the organisation predates it. Its two old keys say
  // exactly what a weekly cadence says, so read them as one.
  return {
    kind: "weekly",
    day: int(settings.exec_digest_day, 1, 1, 7),
    hour: int(settings.exec_digest_hour, 9, 0, 23),
    minute: 0,
  };
}

export function readRhythm(settings: Record<string, unknown>): RhythmConfig {
  const d = RHYTHM_DEFAULTS;
  return {
    promptDay: int(settings.checkin_prompt_day, d.promptDay, 1, 7),
    promptHour: int(settings.checkin_prompt_hour, d.promptHour, 0, 23),
    promptMinute: int(settings.checkin_prompt_minute, d.promptMinute, 0, 59),
    reminderHour: int(settings.checkin_reminder_hour, d.reminderHour, 0, 23),
    reminderMinute: int(settings.checkin_reminder_minute, d.reminderMinute, 0, 59),
    digestCadence: readCadence(settings),
    briefCurrentCycle: bool(settings.brief_current_cycle, d.briefCurrentCycle),
    /*
     * Minutes, falling back to the hours key the organisation was configured
     * with. Multiplying the old value rather than defaulting keeps a deployment
     * mid-rollout on the window its administrator chose, instead of silently
     * resetting everyone to twenty-four hours.
     */
    reviewWindowMinutes: int(
      settings.review_window_minutes,
      int(settings.review_window_hours, 24, 1, 168) * 60,
      5,
      7 * 24 * 60,
    ),
    maxNudgesPerDay: int(settings.max_nudges_per_day, d.maxNudgesPerDay, 1, 20),
    nextDigestAt: instant(settings.exec_digest_next_at),
    reportingStartsOn: day(settings.reporting_starts_on),
  };
}

/** Read one organisation's rhythm, as the person asking. */
export async function rhythmFor(actor: string): Promise<RhythmConfig> {
  const rows = await asActor(
    actor,
    (sql) => sql<{ settings: Record<string, unknown> }>`
      select settings from organizations
      where id = (select org_id from profiles where id = ${actor})
    `,
  );
  return readRhythm(rows[0]?.settings ?? {});
}

/**
 * Save the rhythm.
 *
 * Merged into `settings` rather than replacing it: the object also holds the
 * week start and the calibration window, and a form that knows about nine
 * fields writing the whole object back would silently reset the rest.
 *
 * The two superseded keys are written alongside the cadence, not instead of it.
 * A weekly cadence still means "Monday 9" to anything that has not been
 * redeployed yet, and leaving them stale would make a rollback brief the
 * Chairman at whatever hour he was on months ago.
 */
export async function updateRhythm(
  actor: string,
  next: RhythmConfig,
): Promise<boolean> {
  const c = next.digestCadence;
  const patch: Record<string, unknown> = {
    checkin_prompt_day: next.promptDay,
    checkin_prompt_hour: next.promptHour,
    checkin_prompt_minute: next.promptMinute,
    checkin_reminder_hour: next.reminderHour,
    checkin_reminder_minute: next.reminderMinute,
    exec_digest_cadence: c,
    brief_current_cycle: next.briefCurrentCycle,
    review_window_minutes: next.reviewWindowMinutes,
    max_nudges_per_day: next.maxNudgesPerDay,
    exec_digest_next_at: next.nextDigestAt,
    reporting_starts_on: next.reportingStartsOn,
    // Kept in step for anything still reading the old shape.
    review_window_hours: Math.max(1, Math.round(next.reviewWindowMinutes / 60)),
    ...(c.kind === "weekly"
      ? { exec_digest_day: c.day, exec_digest_hour: c.hour }
      : {}),
  };

  const rows = await asActor(
    actor,
    (sql) => sql<{ id: string }>`
      update organizations
         set settings   = settings || ${JSON.stringify(patch)}::text::jsonb,
             updated_at = now()
       where id = (select org_id from profiles where id = ${actor})
      returning id
    `,
  );
  return rows.length > 0;
}

/**
 * Ask for one brief at a given instant, without touching the cadence.
 *
 * Separate from `updateRhythm` because it is a different kind of act: a request
 * for one delivery, not a change to how the organisation runs. Keeping them
 * apart is what stops "send it in ten minutes" from permanently rewriting the
 * schedule somebody else agreed to.
 */
export async function scheduleOneOffDigest(
  actor: string,
  at: Date | null,
): Promise<boolean> {
  const patch = { exec_digest_next_at: at ? at.toISOString() : null };
  const rows = await asActor(
    actor,
    (sql) => sql<{ id: string }>`
      update organizations
         set settings   = settings || ${JSON.stringify(patch)}::text::jsonb,
             updated_at = now()
       where id = (select org_id from profiles where id = ${actor})
      returning id
    `,
  );
  return rows.length > 0;
}

/**
 * Clear a fulfilled one-off.
 *
 * Runs as the service role because the job that fulfils it has no human behind
 * it. Leaving the instant in place would be harmless — the gate also checks
 * that nothing has been delivered since it — but an administrator opening the
 * page an hour later should not read "a brief is pending" about one that has
 * already arrived.
 */
export async function clearOneOffDigest(orgId: string): Promise<void> {
  await asService(
    (sql) => sql`
      update organizations
         set settings = settings - 'exec_digest_next_at'
       where id = ${orgId}
    `,
  );
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------
//
// Pure, and therefore in rhythm-vocabulary.ts: the admin page has to show an
// administrator the actual date "every Tuesday at 07:30" produces, and a client
// component importing it from here would drag the Postgres driver into the
// browser bundle. Re-exported so every existing caller keeps its import.

export {
  localNow,
  momentHasArrived,
  lastCadenceMoment,
  nextCadenceMoment,
  digestDue,
  gateFor,
} from "./rhythm-vocabulary";
export type { Gate, GateState } from "./rhythm-vocabulary";

/**
 * Every organisation's rhythm, for the scheduled run.
 *
 * Runs as the service role because a scheduled job has no human behind it, and
 * it reads only the two columns the gate needs.
 */
export async function allRhythms(): Promise<
  { orgId: string; timezone: string; rhythm: RhythmConfig }[]
> {
  const rows = await asService(
    (sql) => sql<{ id: string; timezone: string; settings: Record<string, unknown> }>`
      select id, timezone, settings from organizations
    `,
  );
  return rows.map((r) => ({
    orgId: r.id,
    timezone: r.timezone,
    rhythm: readRhythm(r.settings),
  }));
}
