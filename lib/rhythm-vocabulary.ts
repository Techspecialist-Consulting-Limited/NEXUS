/*
 * Rhythm vocabulary — pure data, safe on either side of the boundary.
 *
 * Same split as roles.ts from auth.ts and org-vocabulary.ts from
 * organization.ts: lib/rhythm.ts opens a database connection, and a client
 * component importing one constant from it drags the Postgres driver into the
 * browser bundle. Nothing here imports anything.
 */

/**
 * When the Chairman's brief goes out.
 *
 * WHY THIS IS A UNION AND NOT A DAY PLUS AN HOUR.
 *
 * It was a day plus an hour, and that made one shape of organisation possible
 * and every other shape impossible. "Monday at 9" cannot express "every
 * morning", cannot express "every twenty minutes while we pilot this", and
 * cannot express "never on a schedule, I will ask". Worse, the finest grain it
 * could reach was an hour, so the shortest honest answer to "when will the
 * Chairman see this?" was "sometime in the next sixty minutes".
 *
 * Each variant carries only what it needs. A `manual` cadence has no hour to
 * misread and no day to ignore, which is the point of modelling it as a
 * separate shape rather than a boolean sitting next to a time nobody uses.
 */
export type DigestCadence =
  /** The default and the right one for a settled organisation. */
  | { kind: "weekly"; day: number; hour: number; minute: number }
  | { kind: "daily"; hour: number; minute: number }
  /** Every N minutes. For a pilot, a launch week, or a demonstration. */
  | { kind: "interval"; minutes: number }
  /** Only ever when somebody presses the button. */
  | { kind: "manual" };

export type RhythmConfig = {
  /** ISO weekday, 1 = Monday. The day the week's check-in opens. */
  promptDay: number;
  promptHour: number;
  promptMinute: number;
  /**
   * When NEXUS chases whoever has not answered.
   *
   * ISO weekday, and it was hard-wired to `promptDay` — the chase could only
   * ever be a few hours after the opening. An organisation that opens the week
   * on Friday and wants a last call on Sunday evening, so people still have the
   * weekend, could not say so.
   *
   * IT MUST BE AT OR AFTER THE OPENING, IN THE SAME WEEK. Not a style rule:
   * `currentCycles` resolves the week containing today, so a chase on an
   * earlier weekday belongs to the FOLLOWING calendar week and would chase
   * people about a week nobody has been asked about yet. Both the form and the
   * route refuse it.
   */
  reminderDay: number;
  reminderHour: number;
  reminderMinute: number;
  /** When the Chairman's brief goes out. */
  digestCadence: DigestCadence;
  /**
   * Brief on the week IN PROGRESS rather than only on a week that has ended.
   *
   * Off, a week can only settle after its last day has passed — so the fastest
   * a first brief could ever arrive was the following Monday, whatever the
   * schedule said. On, a week settles as soon as its correction window has
   * elapsed, which is what makes "brief him in ten minutes" a real sentence
   * rather than a setting that quietly does nothing.
   *
   * Rule 2 is not weakened by it: the subject still gets the whole correction
   * window before anything rolls up. The window is shorter, and that is a
   * choice the organisation makes with its eyes open.
   */
  briefCurrentCycle: boolean;
  /**
   * Minutes somebody has to correct their own reconciliation before it rolls
   * up. Minutes rather than hours because the floor used to be one hour, and
   * an hour is longer than some organisations want to wait to see whether any
   * of this works at all.
   */
  reviewWindowMinutes: number;
  /** The most NEXUS will send one person in a day, across every kind. */
  maxNudgesPerDay: number;
  /**
   * A one-off delivery, as an ISO instant. Null when none is pending.
   *
   * This is the "I need it in ten minutes" control, and it is deliberately
   * separate from the cadence rather than a fifth variant of it. Asking for one
   * brief now is not a statement about the rhythm, and it must not overwrite
   * the rhythm to be honoured — otherwise every urgent request silently
   * reconfigures the organisation.
   *
   * Cleared once fulfilled.
   */
  nextDigestAt: string | null;
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

/** The intervals worth offering. Below five minutes the tick cannot keep up. */
export const INTERVAL_CHOICES = [5, 10, 15, 30, 60, 120, 240, 480, 720, 1440];

/** The correction windows worth offering, in minutes. */
export const REVIEW_WINDOW_CHOICES = [5, 10, 15, 30, 60, 180, 360, 720, 1440, 2880, 4320];

/** "45 minutes", "2 hours", "3 days". Written the way somebody says it. */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (minutes < 1440) {
    const h = minutes / 60;
    const rounded = Number.isInteger(h) ? h : Math.round(h * 10) / 10;
    return `${rounded} hour${rounded === 1 ? "" : "s"}`;
  }
  const d = minutes / 1440;
  const rounded = Number.isInteger(d) ? d : Math.round(d * 10) / 10;
  return `${rounded} day${rounded === 1 ? "" : "s"}`;
}

/** 9, 0 → "09:00". Twenty-four hour, because 9:30 has no am/pm shorthand. */
export function clockLabel(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * The cadence, in one line a person can check against what they meant.
 *
 * Used on the admin page, in the audit log and in the API's own description of
 * what changed — so all three say the same words about the same setting.
 */
export function describeCadence(c: DigestCadence): string {
  switch (c.kind) {
    case "weekly":
      return `every ${DAY_NAME[c.day]} at ${clockLabel(c.hour, c.minute)}`;
    case "daily":
      return `every day at ${clockLabel(c.hour, c.minute)}`;
    case "interval":
      return `every ${durationLabel(c.minutes)}`;
    case "manual":
      return "only when somebody asks";
  }
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/** ISO weekday (1 = Monday), hour and minute, in the given timezone. */
export function localNow(
  timezone: string,
  at: Date = new Date(),
): { day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(at);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  const ISO: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };
  return { day: ISO[weekday] ?? 1, hour: hour % 24, minute };
}

/**
 * Has this moment arrived, in this organisation's own week?
 *
 * At-or-after within the same ISO week, so a late tick catches up. A job whose
 * day has passed entirely is still due — Friday's prompt run for the first time
 * on Saturday is late, but a week nobody was ever asked about is worse.
 *
 * This is still the rule for the prompt and the chase, which are weekly by
 * nature and idempotent per cycle. The brief needs more than this, and gets it
 * below.
 */
export function momentHasArrived(
  now: { day: number; hour: number; minute: number },
  day: number,
  hour: number,
  minute = 0,
): boolean {
  if (now.day > day) return true;
  if (now.day < day) return false;
  return now.hour * 60 + now.minute >= hour * 60 + minute;
}

const MINUTE = 60_000;

/**
 * The most recent instant at which this cadence came round, at or before `at`.
 *
 * Computed by rewinding from now rather than by constructing a local date,
 * which avoids reimplementing timezone arithmetic: find how far into the cycle
 * the organisation's own wall clock currently is, and step back by that much.
 *
 * Across a daylight-saving transition this can land an hour out, twice a year,
 * in zones that observe one. The consequence is a brief arriving an hour early
 * or late on those two days — worth naming, and not worth a date library.
 *
 * Returns null for cadences that have no recurring moment.
 */
export function lastCadenceMoment(
  cadence: DigestCadence,
  timezone: string,
  at: Date = new Date(),
): Date | null {
  const now = localNow(timezone, at);

  if (cadence.kind === "weekly") {
    const nowMinute = (now.day - 1) * 1440 + now.hour * 60 + now.minute;
    const target = (cadence.day - 1) * 1440 + cadence.hour * 60 + cadence.minute;
    const delta = ((nowMinute - target) % 10080 + 10080) % 10080;
    return new Date(at.getTime() - delta * MINUTE);
  }

  if (cadence.kind === "daily") {
    const nowMinute = now.hour * 60 + now.minute;
    const target = cadence.hour * 60 + cadence.minute;
    const delta = ((nowMinute - target) % 1440 + 1440) % 1440;
    return new Date(at.getTime() - delta * MINUTE);
  }

  return null;
}

/**
 * The next instant this cadence will come round, at or after `at`.
 *
 * Shown on the admin page. An administrator who has just chosen "every Tuesday
 * at 07:30" should be able to read back the actual date that produces, rather
 * than recompute it and hope.
 */
export function nextCadenceMoment(
  cadence: DigestCadence,
  timezone: string,
  at: Date = new Date(),
): Date | null {
  if (cadence.kind === "manual") return null;
  if (cadence.kind === "interval") return new Date(at.getTime() + cadence.minutes * MINUTE);

  const last = lastCadenceMoment(cadence, timezone, at);
  if (!last) return null;
  const period = cadence.kind === "weekly" ? 10080 : 1440;
  return new Date(last.getTime() + period * MINUTE);
}

/**
 * State the brief's gate needs and cannot derive: when one was last delivered.
 *
 * Passed in rather than read here, because the gate is a pure comparison and
 * every test of it should be able to say "pretend the last one went out on
 * Tuesday" without a database.
 */
export type GateState = { lastDigestAt?: Date | null };

export type Gate = { due: boolean; reason: string };

/**
 * Is a brief due for this organisation right now?
 *
 * Three ways to be due, checked in the order somebody would expect:
 *
 *   1. A one-off was asked for, its moment has passed, and nothing has gone out
 *      since it was asked for. This wins over everything, including `manual` —
 *      the whole point of asking is that the cadence had no answer.
 *   2. An interval cadence, and enough time has passed since the last one.
 *   3. A weekly or daily moment has come round and nothing has gone out since.
 */
export function digestDue(
  rhythm: RhythmConfig,
  timezone: string,
  state: GateState = {},
  at: Date = new Date(),
): Gate {
  const last = state.lastDigestAt ?? null;
  const cadence = rhythm.digestCadence;

  if (rhythm.nextDigestAt) {
    const asked = new Date(rhythm.nextDigestAt);
    if (at >= asked && (!last || last < asked)) {
      return { due: true, reason: "a one-off was asked for" };
    }
    /*
     * A pending one-off does not suppress the cadence. Somebody asking for an
     * extra brief on Thursday has said nothing about Monday's, and swallowing
     * it would make the urgent request cost them the regular one.
     */
  }

  switch (cadence.kind) {
    case "manual":
      return { due: false, reason: "sent only when somebody asks" };

    case "interval": {
      if (!last) return { due: true, reason: "no brief has gone out yet" };
      const elapsed = (at.getTime() - last.getTime()) / MINUTE;
      return elapsed >= cadence.minutes
        ? { due: true, reason: "" }
        : {
            due: false,
            reason: `next in ${Math.max(1, Math.ceil(cadence.minutes - elapsed))} min`,
          };
    }

    case "daily":
    case "weekly": {
      const moment = lastCadenceMoment(cadence, timezone, at);
      if (!moment) return { due: false, reason: "no moment configured" };
      if (last && last >= moment) {
        return { due: false, reason: `already sent for ${describeCadence(cadence)}` };
      }
      return { due: true, reason: "" };
    }
  }
}

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
  state: GateState = {},
  /*
   * The instant to judge against. Defaults to now, and exists so the gate can
   * be driven in a test — `digestDue` below already takes one, and a rhythm
   * whose weekday arithmetic can only be exercised by waiting until Sunday is
   * a rhythm nobody exercises.
   */
  instant: Date = new Date(),
): Gate {
  const now = localNow(timezone, instant);
  const at = (d: number, h: number, m: number) =>
    `${DAY_NAME[d]} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  switch (job) {
    case "prompt":
      return momentHasArrived(now, rhythm.promptDay, rhythm.promptHour, rhythm.promptMinute)
        ? { due: true, reason: "" }
        : {
            due: false,
            reason: `opens ${at(rhythm.promptDay, rhythm.promptHour, rhythm.promptMinute)}`,
          };

    case "remind":
      return momentHasArrived(now, rhythm.reminderDay, rhythm.reminderHour, rhythm.reminderMinute)
        ? { due: true, reason: "" }
        : {
            due: false,
            reason: `chases ${at(rhythm.reminderDay, rhythm.reminderHour, rhythm.reminderMinute)}`,
          };

    case "digest":
    case "send-digest":
      return digestDue(rhythm, timezone, state, instant);

    default:
      return { due: true, reason: "" };
  }
}
