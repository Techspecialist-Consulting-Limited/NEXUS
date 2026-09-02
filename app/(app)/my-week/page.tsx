import { redirect } from "next/navigation";
import { currentActorId, requireViewer } from "@/lib/session";
import { homeFor } from "@/lib/nav";
import { hasPersonalWorkspace } from "@/lib/capabilities";
import { asActor } from "@/lib/db";
import {
  currentCycle,
  getPerson,
  liveCommitments,
  openCheckInCycle,
  recentCycles,
  weekLedger,
} from "@/lib/queries";
import { weeklyBrief } from "@/lib/coach";
import { MyWeekWorkspace } from "@/components/myweek/my-week-workspace";

export const dynamic = "force-dynamic";

/*
 * "My Week" — the employee's home, and the highest-priority screen in the
 * product. A server component: fetches, then hands plain props to one client
 * leaf that owns the motion.
 *
 * Everyone who files a check-in gets the co-pilot view: staff, leads and HR. A
 * lead's own week is the same object as anybody else's, and a lead who stops
 * reporting is a lead whose unit learns that reporting is optional. Their team
 * lives on its own tab, so this page stays about them.
 */
export default async function MyWeekPage() {
  const actor = await currentActorId();
  // Resolves the same membership the shell already needed, so identity is set
  // before the page reads anything actor-scoped.
  await requireViewer();
  const me = await getPerson(actor);
  if (!me) redirect("/");

  /*
   * Redirected FIRST, before any work is done.
   *
   * Only the Chairman. He files nothing and has no /my-week in his rail, and
   * this page used to fall through to a personal week view offering him a
   * "Give an update" button for a workflow the product deliberately excludes
   * him from — after building the whole brief, which means a model call for a
   * page he was about to be sent away from.
   *
   * The Administrator used to be sent away too, and that was the bug: an admin
   * is a staff member with extra capability, not a separate kind of user, and
   * they have a week like everybody else. See lib/capabilities.ts.
   */
  if (!hasPersonalWorkspace(me.role)) {
    redirect(homeFor(me.role));
  }

  /*
   * THE WEEK WE ARE IN. Not the last one that settled.
   *
   * This asked the rhythm first and fell back to `recentCycles.at(-1)`, which
   * deliberately excludes the current week because it serves the executive
   * view. So on Friday 28 August, with no check-in yet opened for the week of
   * the 24th, the page headed itself "17 Aug–23 Aug" — a week that had ended
   * five days before — and every card under it answered about that week.
   *
   * The order now: the week containing today, then the rhythm's open check-in,
   * then whatever exists. The first two agree whenever the rhythm has run, and
   * when they disagree the calendar is the one a person can verify by looking
   * out of the window.
   *
   * `open` is still read, because "your check-in is open" is a different fact
   * from "this is the current week" and the card says so.
   */
  const [cycles, current, open] = await Promise.all([
    recentCycles(actor),
    currentCycle(actor),
    openCheckInCycle(actor, me.id),
  ]);
  const week = current ?? open ?? cycles.at(-1);

  if (!week) {
    return (
      <p className="py-16 text-center text-sm text-secondary">
        No reporting weeks yet.
      </p>
    );
  }

  const [brief, live, checkIn, ledger] = await Promise.all([
    weeklyBrief(actor, me.id, week.id, me.full_name, week.label),
    /*
     * What they are working on RIGHT NOW, which is a different question from
     * what `weeklyBrief` answers.
     *
     * The brief is scoped to one week's promises — correct for reconciling that
     * week, and wrong for a card headed "what you're working on", because the
     * two-cycle model puts the answer in the following week: a check-in filed
     * in W34 creates commitments targeting W35, while this page is showing W34.
     * The card could therefore only ever be empty for the person who had just
     * filed, which is exactly who was looking at it.
     */
    liveCommitments(actor, me.id),
    /*
     * When they last filed. Read through asActor and scoped to their own
     * profile — policy `check_ins_own` restricts these rows to their author,
     * which is exactly right and is why this cannot be a shared query.
     */
    asActor(
      actor,
      (sql) => sql<{ responded_at: string | null }>`
        select responded_at from check_ins
        where profile_id = ${me.id} and cycle_id = ${week.id}
          and responded_at is not null
        order by responded_at desc limit 1
      `,
    ),
    /*
     * The shape of the record they are adding to. Counted from commitments
     * rather than reconciliations so the week in progress is included — see
     * weekLedger in lib/queries.ts.
     */
    /*
     * Six, plus the current week, is seven columns — which is what fits the
     * sidebar at a 56px floor without scrolling. Eight scrolled, and the
     * column that went off the right edge was the current one, since the
     * strip runs oldest to newest. A record whose most recent entry is the
     * hidden one is a record nobody reads.
     */
    weekLedger(actor, me.id, 6),
  ]);

  /*
   * THE WEEK YOU ARE STANDING IN IS ALWAYS ON THE LEDGER.
   *
   * `weekLedger` joins commitments, so a week nobody has promised into yet
   * has no row — and on a Monday that is precisely the current week. The
   * strip then ended at the week before, and the reader had no mark for
   * where they were standing.
   *
   * Zero promised is a fact about the week, not a gap in the record, so it
   * is stated rather than skipped. Every value here comes from the cycle row
   * itself; nothing is estimated.
   */
  const ledgerWeeks = ledger.some((w) => w.id === week.id)
    ? ledger
    : [
        ...ledger,
        {
          id: week.id,
          label: week.label,
          starts_on: week.starts_on,
          ends_on: week.ends_on,
          promised: 0,
          delivered: 0,
        },
      ];
  /* Order is the strip's own business — it sorts by date. Appending rather
     than prepending only avoids implying one here. */

  return (
    <MyWeekWorkspace
      person={me}
      cycleId={week.id}
      cycleLabel={week.label}
      live={live}
      coaching={brief.coaching}
      reportedAt={checkIn[0]?.responded_at ?? null}
      ledger={ledgerWeeks}
    />
  );
}
