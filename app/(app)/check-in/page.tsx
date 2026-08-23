import { redirect } from "next/navigation";
import { hasPersonalWorkspace } from "@/lib/capabilities";
import { homeFor } from "@/lib/nav";
import { currentActorId } from "@/lib/session";
import { getPerson, recentCycles, reportingStreak } from "@/lib/queries";
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

  const cycles = await recentCycles(actor);
  const week = cycles.at(-1);
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
