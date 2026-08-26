import { NextResponse } from "next/server";
import { z } from "zod";
import { currentViewer } from "@/lib/auth";
import { hasAdministration } from "@/lib/capabilities";
import { rhythmFor, updateRhythm } from "@/lib/rhythm";
import { DAY_NAME } from "@/lib/rhythm-vocabulary";
import { record } from "@/lib/audit";

/*
 * Set the reporting rhythm.
 *
 * Every value here is read by `gateFor` on the next tick, so this is a real
 * control and not a stored preference. The write goes through asActor, so
 * `org_admin_write` decides whether it lands.
 */

const body = z.object({
  promptDay: z.number().int().min(1).max(7),
  promptHour: z.number().int().min(0).max(23),
  reminderHour: z.number().int().min(0).max(23),
  digestDay: z.number().int().min(1).max(7),
  digestHour: z.number().int().min(0).max(23),
  reviewWindowHours: z.number().int().min(1).max(168),
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
   * A chase earlier than the opening would never fire — there is nothing to
   * chase yet. Refused here as well as in the form, because a form check is
   * not a rule, it is a courtesy.
   */
  if (parsed.data.reminderHour <= parsed.data.promptHour) {
    return NextResponse.json(
      { error: "The chase has to come after the week opens, or it would never fire." },
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
  const ok = await updateRhythm(actor, parsed.data);
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
  const changes: string[] = [];
  if (before.promptDay !== n.promptDay || before.promptHour !== n.promptHour) {
    changes.push(`moved the week's opening to ${DAY_NAME[n.promptDay]} ${n.promptHour}:00`);
  }
  if (before.reminderHour !== n.reminderHour) {
    changes.push(`moved the chase to ${n.reminderHour}:00`);
  }
  if (before.digestDay !== n.digestDay || before.digestHour !== n.digestHour) {
    changes.push(
      `moved the Chairman's brief to ${DAY_NAME[n.digestDay]} ${n.digestHour}:00`,
    );
  }
  if (before.reviewWindowHours !== n.reviewWindowHours) {
    changes.push(`set the correction window to ${n.reviewWindowHours} hours`);
  }
  if (before.maxNudgesPerDay !== n.maxNudgesPerDay) {
    changes.push(`set the daily message budget to ${n.maxNudgesPerDay}`);
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
