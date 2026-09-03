import { NextResponse } from "next/server";
import { z } from "zod";
import { currentViewer } from "@/lib/auth";
import { hasAdministration } from "@/lib/capabilities";
import { scheduleOneOffDigest } from "@/lib/rhythm";
import { durationLabel } from "@/lib/rhythm-vocabulary";
import { runReconcile, runDigest, runSendDigest } from "@/lib/schedule";
import { record } from "@/lib/audit";

/*
 * Ask for the Chairman's brief — now, or at a chosen moment.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE RHYTHM.
 *
 * Setting a cadence and asking for one brief are different acts, and collapsing
 * them is how a schedule gets quietly rewritten by somebody in a hurry. "I need
 * him briefed in ten minutes" says nothing about Mondays, and honouring it must
 * not cost the organisation its Monday.
 *
 * The only other way to trigger a brief was POST /api/cron/tick?job=digest with
 * the CRON_SECRET — which is to say, not a way an administrator has. It also
 * runs for EVERY organisation, so a Techspecialist administrator pressing it
 * would have briefed another tenant's Chairman. Everything here is scoped to
 * the caller's own organisation.
 */

const body = z.discriminatedUnion("action", [
  /** Run the chain now and report exactly how far it got. */
  z.object({ action: z.literal("now") }),
  /**
   * Queue one brief. Minutes from now, because that is how the request is
   * actually phrased — "in ten minutes", never "at 14:37:00Z". An absolute
   * instant is accepted too, for a form that offers a date and time.
   */
  z.object({
    action: z.literal("schedule"),
    inMinutes: z.number().int().min(1).max(60 * 24 * 14).optional(),
    at: z.string().datetime().optional(),
  }),
  z.object({ action: z.literal("cancel") }),
]);

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }

  const viewer = await currentViewer();
  if (!viewer || viewer.membership.status !== "active") {
    return NextResponse.json({ error: "You are not signed in." }, { status: 401 });
  }
  if (!hasAdministration(viewer.membership.role)) {
    return NextResponse.json(
      { error: "You do not have permission to send the Chairman's brief." },
      { status: 403 },
    );
  }

  const { profileId, fullName, orgId, orgName } = viewer.membership;
  const target = { kind: "organization" as const, name: orgName };

  if (parsed.data.action === "cancel") {
    await scheduleOneOffDigest(profileId, null);
    await record(
      profileId, fullName, "org.profile_updated",
      `${fullName} cancelled the brief that was queued for the Chairman.`, target,
    );
    return NextResponse.json({ ok: true, scheduledFor: null });
  }

  if (parsed.data.action === "schedule") {
    const { inMinutes, at } = parsed.data;
    if (inMinutes === undefined && !at) {
      return NextResponse.json(
        { error: "Say when: either a number of minutes from now, or a date and time." },
        { status: 422 },
      );
    }

    const when = at ? new Date(at) : new Date(Date.now() + (inMinutes ?? 0) * 60_000);
    /*
     * A moment already past would fire on the very next tick, which is a
     * confusing way to spell "now" and usually means a timezone was misread on
     * the way in. Refuse it and name the alternative rather than guessing.
     */
    if (when.getTime() < Date.now() - 60_000) {
      return NextResponse.json(
        { error: "That moment has already passed. Use “Send it now” instead." },
        { status: 422 },
      );
    }

    const ok = await scheduleOneOffDigest(profileId, when);
    if (!ok) {
      return NextResponse.json({ error: "That could not be saved." }, { status: 403 });
    }

    await record(
      profileId, fullName, "org.profile_updated",
      inMinutes
        ? `${fullName} asked for the Chairman's brief in ${durationLabel(inMinutes)}.`
        : `${fullName} queued the Chairman's brief for ${when.toISOString()}.`,
      target,
    );
    return NextResponse.json({ ok: true, scheduledFor: when.toISOString() });
  }

  // ---- action: "now" ------------------------------------------------------

  /*
   * The whole chain, in dependency order, scoped to this organisation.
   *
   * Reconcile first, and this is not tidiness. The brief reads settled
   * reconciliations; running only the digest would brief on whatever the last
   * tick happened to settle, so "send it now" would deliver a picture up to an
   * hour old and look like it had worked.
   *
   * `narrate` is deliberately skipped — it writes per-person readouts for the
   * employee's own page, which the brief does not read, and it is the slowest
   * step by a wide margin.
   */
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
  ).replace(/\/+$/, "");

  /*
   * `immediate` is the whole difference between this and the scheduler.
   *
   * Without it the chain cannot produce anything on the day an organisation is
   * created: the week has not ended, so no correction window opens, so nothing
   * auto-confirms, so there is no settled cycle and the button answers "No
   * settled cycle to brief on yet" — which is what it did. It settles the week
   * on the spot instead, and the audit entry below records that the review
   * window was overridden by a named person rather than quietly skipped.
   */
  const reconciled = await runReconcile(orgId, true);
  const built = await runDigest(true, orgId);
  const delivered = await runSendDigest(appUrl, orgId);

  await record(
    profileId, fullName, "org.profile_updated",
    `${fullName} sent the Chairman's brief by hand, settling the week early ` +
      `rather than waiting for the correction window. ${built.detail}`,
    target,
  );

  /*
   * Report what actually happened rather than a cheerful 200.
   *
   * The common failure is not an error — it is "there is no settled week to
   * brief on", which happens whenever the current week has not ended and the
   * organisation has not chosen to brief on the week in progress. That is a
   * setting away from working, and the message says so.
   */
  const wrote = (built.counts?.written ?? 0) + (built.counts?.waiting ?? 0);
  const sent = delivered.counts?.sent ?? 0;

  /*
   * NAME THE STEP THAT STOPPED, because three different dead ends used to
   * arrive as the same sentence.
   *
   * "No brief was written" was reported whether nothing had settled, the
   * organisation had no Chairman to brief, or the mail provider refused it —
   * three problems with three different fixes, and the message pointed at none
   * of them. With the week now settled on demand, the remaining reasons are
   * worth telling apart.
   */
  const detail =
    wrote === 0
      ? `${built.detail} (${reconciled.detail})`
      : sent === 0
        ? `The brief was written but not delivered. ${delivered.detail}`
        : delivered.detail;

  return NextResponse.json({
    ok: built.ok,
    wrote,
    sent,
    steps: [reconciled, built, delivered],
    detail,
  });
}
