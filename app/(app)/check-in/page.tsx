import { redirect } from "next/navigation";
import { hasPersonalWorkspace } from "@/lib/capabilities";
import { homeFor } from "@/lib/nav";
import { currentActorId } from "@/lib/session";
import {
  currentCycle,
  getPerson,
  openCheckInCycle,
  recentCycles,
  reportingStreak,
} from "@/lib/queries";
import { openCommitments } from "@/lib/checkin";
import { CheckInFlow } from "@/components/checkin/check-in-flow";

export const dynamic = "force-dynamic";

/*
 * GUIDE §12 Check-In.
 *
 * The employee never faces a blank form: the week's open commitments are
 * already here, and the only typing is what actually changed.
 */
export default async function CheckInPage() {
  const actor = await currentActorId();
  const me = await getPerson(actor);
  if (!me) redirect("/");

  /*
   * Only the Chairman. He consumes reporting and does not produce it.
   *
   * The Administrator used to be sent away here too, which meant an admin
   * could reach "Check in" from their own rail and be bounced to a command
   * view — they configure the reporting rhythm and were the one seat exempt
   * from taking part in it. See lib/capabilities.ts.
   */
  if (!hasPersonalWorkspace(me.role)) {
    redirect(homeFor(me.role));
  }

  /*
   * THE WEEK WE ARE IN. Not the last one that closed.
   *
   * This was `recentCycles(actor).at(-1)`, and that function excludes the
   * current week ON PURPOSE — it serves the executive view, where the
   * interesting week is the most recent SETTLED one. Its own comment warns
   * against this exact use: on Friday 28 August it answered "17–23 August",
   * a week that had ended five days earlier.
   *
   * So this page filed a check-in against last week, and on a NEW
   * organisation — where no week has ended yet — it returned nothing at all
   * and rendered "No reporting week is open" on day one.
   *
   * /my-week was fixed for this and this page was not. Same ordering, and
   * the two must agree: the calendar week, then the rhythm's open check-in,
   * then whatever exists.
   */
  const [cycles, current, openWeek] = await Promise.all([
    recentCycles(actor),
    currentCycle(actor),
    openCheckInCycle(actor, me.id),
  ]);
  const week = current ?? openWeek ?? cycles.at(-1);
  if (!week) {
    return <p className="py-16 text-center text-sm text-secondary">No reporting week is open.</p>;
  }

  const [open, streak] = await Promise.all([
    openCommitments(actor, me.id, week.id),
    reportingStreak(actor, me.id),
  ]);

  return (
    <CheckInFlow
      cycleId={week.id}
      cycleLabel={week.label}
      open={open}
      deliveryRate={streak.delivery_rate}
      streakWeeks={streak.streak_weeks}
    />
  );
}
