import { notFound } from "next/navigation";
import { currentActorId } from "@/lib/session";
import {
  commitmentsFor,
  cycleAfter,
  getPerson,
  latestVisibleCycle,
  openAsOfWeek,
  weeklyPersonReports,
} from "@/lib/queries";
import { PersonWeek } from "@/components/executive/person-week";

export const dynamic = "force-dynamic";

/*
 * One person's week — the drill-down from a name in the Chairman's briefing.
 *
 * ACCESS IS RLS, NOT A ROLE CHECK HERE. Every read goes through asActor, so a
 * lead sees their own unit, HR and the Chairman see the organisation, and
 * everybody sees themselves. A React condition would be a second place for the
 * rule to live, and the place it would eventually be forgotten. If the viewer
 * may not see this person, `getPerson` returns nothing and this 404s.
 *
 * The week shown is the latest SETTLED one, matching the dashboard and the
 * briefing. Showing the live week here would put figures in front of the
 * Chairman that their subject has not confirmed yet.
 */
export default async function PersonPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  const actor = await currentActorId();

  const [person, week] = await Promise.all([
    getPerson(profileId),
    latestVisibleCycle(actor),
  ]);

  /*
   * A PERSON THE VIEWER CANNOT SEE IS A 404. A WEEK THAT HAS NOT SETTLED IS NOT.
   *
   * These were one condition, so a name the Chairman clicked out of his own
   * roster returned "page not found" whenever no week had closed — which is
   * every organisation until its first cycle settles. The person exists; the
   * figures do not exist yet, and those are different answers.
   */
  if (!person) notFound();

  if (!week) {
    return (
      <PersonWeek
        fullName={person.full_name}
        departmentName={person.department_name ?? null}
        cycleLabel={null}
        reported={false}
        commitments={[]}
        planned={[]}
      />
    );
  }

  /*
   * "Taken on next" is the cycle after the one being reported on, which is the
   * same pairing the briefing uses: what landed, then where the work goes.
   *
   * `recentCycles` cannot find it — it deliberately excludes the current week
   * and everything after it (see its own doc comment), so whenever `week`
   * here is the still-running current week, "the week after it" is a future
   * week `recentCycles` will never return, and this always came back empty.
   * `cycleAfter` reads the calendar directly instead, future or not.
   */
  const nextCycle = await cycleAfter(actor, week.id);

  const [settledThisWeek, stillOpen, planned, everyone] = await Promise.all([
    commitmentsFor(actor, profileId, week.id),
    openAsOfWeek(actor, profileId, week.id),
    nextCycle
      ? commitmentsFor(actor, profileId, nextCycle.id)
      : Promise.resolve([]),
    weeklyPersonReports(actor, week.id),
  ]);

  const reported = everyone.find((p) => p.profileId === profileId)?.reported ?? false;

  /*
   * DELIVERED comes from what actually targeted this week; STILL OPEN and
   * HELD UP come from `openAsOfWeek`, which also counts backlog carried from
   * an earlier week that never got resolved — see that function's doc
   * comment. The two sources cannot overlap: a single commitment has one
   * status, and delivered/partial is disjoint from the open statuses
   * `openAsOfWeek` asks for.
   */
  const commitments = [
    ...settledThisWeek.filter((c) => c.status === "delivered" || c.status === "partial"),
    ...stillOpen,
  ];

  return (
    <PersonWeek
      fullName={person.full_name}
      departmentName={person.department_name ?? null}
      cycleLabel={week.label}
      reported={reported}
      commitments={commitments}
      planned={planned}
    />
  );
}
