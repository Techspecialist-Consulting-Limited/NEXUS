import { asActor, asService } from "./db";
import { DAY_NAME, type RhythmConfig } from "./rhythm-vocabulary";

export { DAY_NAME };
export type { RhythmConfig };

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
 * likes — hourly is the sensible setting — and each job runs only once the
 * organisation's own configured moment has arrived for the current cycle.
 *
 * WHY A GATE IS SAFE HERE AND A SCHEDULER WOULD NOT BE
 *
 * Every job is already idempotent BY CONSTRUCTION: prompts and reminders go
 * through enqueue_notification's per-cycle uniqueness, digests have a unique
 * key, and sending checks sent_at. So running them repeatedly costs nothing and
 * "run as soon as we are past the configured time" needs no run ledger, no
 * locking and no catch-up logic. It is a comparison, and that is all.
 *
 * IT IS AT-OR-AFTER, NOT AT-EXACTLY. A scheduler that misses its window — the
 * host was down, the cron was late, the day was a holiday — must not mean the
 * week is never opened. Anything whose moment has passed within the current
 * cycle is due, so a late tick catches up rather than skipping.
 *
 * AN EXPLICIT ?job= CALL IGNORES THE GATE ENTIRELY. That is the manual run: an
 * administrator asking for the digest now means now, and a "run it" button that
 * silently declined because it was Tuesday would be the worst control in the
 * product.
 */

export type RhythmKey =
  | "prompt_day"
  | "prompt_hour"
  | "reminder_hour"
  | "digest_day"
  | "digest_hour";

export const RHYTHM_DEFAULTS: RhythmConfig = {
  promptDay: 5, // Friday
  promptHour: 15,
  reminderHour: 17,
  digestDay: 1, // Monday
  digestHour: 9,
  reviewWindowHours: 24,
  maxNudgesPerDay: 2,
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

function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

export function readRhythm(settings: Record<string, unknown>): RhythmConfig {
  const d = RHYTHM_DEFAULTS;
  return {
    promptDay: int(settings.checkin_prompt_day, d.promptDay, 1, 7),
    promptHour: int(settings.checkin_prompt_hour, d.promptHour, 0, 23),
    reminderHour: int(settings.checkin_reminder_hour, d.reminderHour, 0, 23),
    digestDay: int(settings.exec_digest_day, d.digestDay, 1, 7),
    digestHour: int(settings.exec_digest_hour, d.digestHour, 0, 23),
    reviewWindowHours: int(settings.review_window_hours, d.reviewWindowHours, 1, 168),
    maxNudgesPerDay: int(settings.max_nudges_per_day, d.maxNudgesPerDay, 1, 20),
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
 * week start and the calibration window, and a form that knows about seven
 * fields writing the whole object back would silently reset the rest.
 */
export async function updateRhythm(
  actor: string,
  next: RhythmConfig,
): Promise<boolean> {
  const patch = {
    checkin_prompt_day: next.promptDay,
    checkin_prompt_hour: next.promptHour,
    checkin_reminder_hour: next.reminderHour,
    exec_digest_day: next.digestDay,
    exec_digest_hour: next.digestHour,
    review_window_hours: next.reviewWindowHours,
    max_nudges_per_day: next.maxNudgesPerDay,
    reporting_starts_on: next.reportingStartsOn,
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

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/** ISO weekday (1 = Monday) and hour, in the given timezone. */
function localNow(timezone: string): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");

  const ISO: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };
  return { day: ISO[weekday] ?? 1, hour: hour % 24 };
}

/**
 * Has this moment arrived, in this organisation's own week?
 *
 * At-or-after within the same ISO week, so a late tick catches up. A job whose
 * day has passed entirely is still due — Friday's prompt run for the first time
 * on Saturday is late, but a week nobody was ever asked about is worse.
 */
export function momentHasArrived(
  now: { day: number; hour: number },
  day: number,
  hour: number,
): boolean {
  if (now.day > day) return true;
  if (now.day < day) return false;
  return now.hour >= hour;
}

export type Gate = { due: boolean; reason: string };

/**
 * Should this job run for this organisation right now?
 *
 * `narrate` and `coordinate` are ungated on purpose. They produce nothing a
 * person receives — a cached readout and a set of findings — and holding them
 * back only means somebody opens their week and waits on a model. There is
 * nothing to schedule about work that is invisible until asked for.
 */
export function gateFor(
  job: string,
  rhythm: RhythmConfig,
  timezone: string,
): Gate {
  const now = localNow(timezone);
  const at = (d: number, h: number) => `${DAY_NAME[d]} ${h}:00`;

  switch (job) {
    case "prompt":
      return momentHasArrived(now, rhythm.promptDay, rhythm.promptHour)
        ? { due: true, reason: "" }
        : { due: false, reason: `opens ${at(rhythm.promptDay, rhythm.promptHour)}` };

    case "remind":
      return momentHasArrived(now, rhythm.promptDay, rhythm.reminderHour)
        ? { due: true, reason: "" }
        : { due: false, reason: `chases ${at(rhythm.promptDay, rhythm.reminderHour)}` };

    case "digest":
    case "send-digest":
      return momentHasArrived(now, rhythm.digestDay, rhythm.digestHour)
        ? { due: true, reason: "" }
        : { due: false, reason: `sends ${at(rhythm.digestDay, rhythm.digestHour)}` };

    default:
      return { due: true, reason: "" };
  }
}

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
