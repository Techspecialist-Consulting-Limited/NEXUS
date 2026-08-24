import { notFound } from "next/navigation";
import { currentActorId } from "@/lib/session";
import {
  commitmentsFor,
  getPerson,
  latestVisibleCycle,
  recentCycles,
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
  if (!person || !week) notFound();

  /*
   * "Taken on next" is the cycle after the one being reported on, which is the
   * same pairing the briefing uses: what landed, then where the work goes.
   */
  const cycles = await recentCycles(actor, 12);
  const nextCycle = cycles.find((c) => c.seq === week.seq + 1);

  const [commitments, planned, everyone] = await Promise.all([
    commitmentsFor(actor, profileId, week.id),
    nextCycle
      ? commitmentsFor(actor, profileId, nextCycle.id)
      : Promise.resolve([]),
    weeklyPersonReports(actor, week.id),
  ]);

  const reported = everyone.find((p) => p.profileId === profileId)?.reported ?? false;

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
