import { NextResponse } from "next/server";
import { z } from "zod";
import { currentViewer } from "@/lib/auth";
import { hasAdministration } from "@/lib/capabilities";
import { rhythmFor, updateRhythm } from "@/lib/rhythm";
import { DAY_NAME, describeCadence, durationLabel } from "@/lib/rhythm-vocabulary";
import { record } from "@/lib/audit";

/*
 * Set the reporting rhythm.
 *
 * Every value here is read by `gateFor` on the next tick, so this is a real
 * control and not a stored preference. The write goes through asActor, so
 * `org_admin_write` decides whether it lands.
 */

const cadence = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("weekly"),
    day: z.number().int().min(1).max(7),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
  z.object({
    kind: z.literal("daily"),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
  /*
   * Five minutes is the floor, and it is a fact about the scheduler rather
   * than a preference. The tick fires every five minutes; a cadence shorter
   * than that would promise a precision nothing can deliver, and the setting
   * would be quietly wrong rather than loudly refused.
   */
  z.object({
    kind: z.literal("interval"),
    minutes: z.number().int().min(5).max(10080),
  }),
  z.object({ kind: z.literal("manual") }),
]);

const body = z.object({
  promptDay: z.number().int().min(1).max(7),
  promptHour: z.number().int().min(0).max(23),
  promptMinute: z.number().int().min(0).max(59).default(0),
  reminderDay: z.number().int().min(1).max(7),
  reminderHour: z.number().int().min(0).max(23),
  reminderMinute: z.number().int().min(0).max(59).default(0),
  digestCadence: cadence,
  briefCurrentCycle: z.boolean().default(false),
  reviewWindowMinutes: z.number().int().min(5).max(7 * 24 * 60),
  maxNudgesPerDay: z.number().int().min(1).max(20),
  /*
   * The first week to report on. Null means "since the organisation was
   * created", which is the right default and the one nobody has to think
   * about. Accepted as a plain calendar date rather than a timestamp: a week
   * begins on a day, and a timezone on this value would make the boundary
   * depend on who saved the form.
   */
  reportingStartsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-08-24.")
    .nullable()
    .default(null),
});

export async function PATCH(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Some of those values could not be read. Check the form and try again." },
      { status: 400 },
    );
  }

  /*
   * The chase has to fall after the opening, IN THE SAME WEEK.
   *
   * Compared as a position in the week now that the day is configurable — the
   * old check compared clock times alone, which would have accepted "opens
   * Friday 09:00, chases Monday 10:00" as valid because 10:00 > 09:00.
   *
   * That is not a cosmetic rule. `currentCycles` resolves the week containing
   * today, so a chase on an earlier weekday runs against the FOLLOWING week —
   * it would chase every person about a week nobody has been prompted for.
   *
   * Refused here as well as in the form, because a form check is not a rule,
   * it is a courtesy.
   */
  const opensAt =
    parsed.data.promptDay * 1440 +
    parsed.data.promptHour * 60 +
    parsed.data.promptMinute;
  const chasesAt =
    parsed.data.reminderDay * 1440 +
    parsed.data.reminderHour * 60 +
    parsed.data.reminderMinute;
  if (chasesAt <= opensAt) {
    return NextResponse.json(
      {
        error:
          "The chase has to come after the week opens, in the same week — " +
          "otherwise it would run against a week nobody has been asked about.",
      },
      { status: 422 },
    );
  }

  const viewer = await currentViewer();
  if (!viewer || viewer.membership.status !== "active") {
    return NextResponse.json({ error: "You are not signed in." }, { status: 401 });
  }
  if (!hasAdministration(viewer.membership.role)) {
    return NextResponse.json(
      { error: "You do not have permission to change the reporting rhythm." },
      { status: 403 },
    );
  }

  const actor = viewer.membership.profileId;
  const before = await rhythmFor(actor);

  /*
   * A pending one-off is not part of this form and must survive it. Asking for
   * an extra brief on Thursday, then changing the correction window on Friday,
   * must not silently cancel Thursday's ask — the two are different decisions
   * and the form only carries one of them.
   */
  const ok = await updateRhythm(actor, {
    ...parsed.data,
    nextDigestAt: before.nextDigestAt,
  });
  if (!ok) {
    return NextResponse.json(
      { error: "The reporting rhythm could not be updated." },
      { status: 403 },
    );
  }

  /*
   * Named changes. "Updated the reporting rhythm" tells a reader nothing they
   * could act on months later; "moved the brief from Monday 9 to Tuesday 7"
   * answers the question they actually came with.
   */
  const n = parsed.data;
  const clock = (h: number, m: number) =>
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const changes: string[] = [];

  if (
    before.promptDay !== n.promptDay ||
    before.promptHour !== n.promptHour ||
    before.promptMinute !== n.promptMinute
  ) {
    changes.push(
      `moved the week's opening to ${DAY_NAME[n.promptDay]} ${clock(n.promptHour, n.promptMinute)}`,
    );
  }
  if (
    before.reminderDay !== n.reminderDay ||
    before.reminderHour !== n.reminderHour ||
    before.reminderMinute !== n.reminderMinute
  ) {
    changes.push(
      `moved the chase to ${DAY_NAME[n.reminderDay]} ${clock(n.reminderHour, n.reminderMinute)}`,
    );
  }
  if (
    JSON.stringify(before.digestCadence) !== JSON.stringify(n.digestCadence)
  ) {
    changes.push(`set the Chairman's brief to go out ${describeCadence(n.digestCadence)}`);
  }
  if (before.briefCurrentCycle !== n.briefCurrentCycle) {
    changes.push(
      n.briefCurrentCycle
        ? "allowed the week in progress to settle and be briefed on"
        : "restricted briefing to weeks that have ended",
    );
  }
  if (before.reviewWindowMinutes !== n.reviewWindowMinutes) {
    changes.push(`set the correction window to ${durationLabel(n.reviewWindowMinutes)}`);
  }
  if (before.maxNudgesPerDay !== n.maxNudgesPerDay) {
    changes.push(`set the daily message budget to ${n.maxNudgesPerDay}`);
  }
  if (before.reportingStartsOn !== n.reportingStartsOn) {
    changes.push(
      n.reportingStartsOn
        ? `set reporting to start from ${n.reportingStartsOn}`
        : "reset reporting to start from when the organisation was created",
    );
  }

  if (changes.length > 0) {
    await record(
      actor,
      viewer.membership.fullName,
      "org.profile_updated",
      `${viewer.membership.fullName} ${changes.join(", ")}.`,
      { kind: "organization", name: viewer.membership.orgName },
    );
  }

  return NextResponse.json({ ok: true });
}
