import { redirect } from "next/navigation";
import { currentActorId, requireViewer } from "@/lib/session";
import { homeFor } from "@/lib/nav";
import { hasPersonalWorkspace } from "@/lib/capabilities";
import { asActor } from "@/lib/db";
import { getPerson, openCheckInCycle, recentCycles } from "@/lib/queries";
import { weeklyBrief } from "@/lib/coach";
import { CopilotHome } from "@/components/staff/copilot-home";

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
  /*
   * Read for one field: whether this person has seen the introduction. Cheap —
   * requireViewer resolves the same membership the shell already needed — and
   * it keeps "have they been welcomed" on the membership rather than making
   * this page ask the database a second question about the same row.
   */
  const { membership } = await requireViewer();
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
   * The week the rhythm opened for them, falling back to the most recent
   * settled one.
   *
   * These used to be permanently out of step: recentCycles excludes the
   * current week, so this page showed LAST week for the whole of this one
   * while runPrompt opened THIS week. Somebody following "your check-in is
   * open" filed against a different week than the one they were asked about,
   * and the compliance figures then answered "did they report?" about a week
   * they had not been asked to report on.
   */
  const cycles = await recentCycles(actor);
  const week = (await openCheckInCycle(actor, me.id)) ?? cycles.at(-1);

  if (!week) {
    return (
      <p className="py-16 text-center text-sm text-secondary">
        No reporting weeks yet.
      </p>
    );
  }

  const [brief, checkIn] = await Promise.all([
    weeklyBrief(actor, me.id, week.id, me.full_name, week.label),
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
  ]);

  return (
    <CopilotHome
      firstRun={membership.welcomedAt === null}
      person={me}
      cycleId={week.id}
      cycleLabel={week.label}
      reconciliation={brief.reconciliation}
      commitments={brief.commitments}
      coaching={brief.coaching}
      questions={brief.questions}
      reportedAt={checkIn[0]?.responded_at ?? null}
    />
  );
}
