import { notFound, redirect } from "next/navigation";
import { currentActorId } from "@/lib/session";
import {
  blockingEdges,
  criticalPath,
  departmentHealth,
  getDepartment,
  getPerson,
  latestVisibleCycle,
  teamWeek,
  unitRoster,
  weeklyPersonReports,
} from "@/lib/queries";
import { DepartmentView } from "@/components/dashboard/department-view";

export const dynamic = "force-dynamic";

/*
 * GUIDE §12 Department Drill-Down.
 *
 * Done when "a manager can see who needs support" — so the roster is ordered
 * by who is struggling, and it is left-joined from profiles so somebody who
 * filed nothing still appears. A roster that silently omits non-responders
 * hides the one person who most needs a conversation.
 */
export default async function DepartmentPage({
  params,
}: {
  params: Promise<{ deptId: string }>;
}) {
  const { deptId } = await params;
  const actor = await currentActorId();
  const me = await getPerson(actor);
  if (!me) redirect("/");

  /*
   * THE ONLY 404 ON THIS PAGE IS AN ID THAT IS NOT A UNIT.
   *
   * `latestVisibleCycle` used to be checked first, and answering null with
   * notFound() meant a unit that plainly exists returned "page not found"
   * whenever no week had settled yet — which is every organisation until its
   * first reporting cycle closes. The Chairman's own dashboard renders these
   * units as links, so the most natural click on his landing page 404'd on
   * day one.
   *
   * A young organisation is a state, not a missing page.
   */
  const department = await getDepartment(actor, deptId);
  if (!department) notFound();

  const week = await latestVisibleCycle(actor);

  if (!week) {
    /*
     * No week has closed, so there are no figures — but the unit and the
     * people in it are facts already, and they are what somebody opening this
     * page before the first cycle actually wants to check.
     *
     * `unitRoster` is the same query the Chairman's dashboard counts from, so
     * the roster here and the headcount he clicked from cannot disagree.
     */
    const roster = await unitRoster(actor);
    const unit = roster.units.find((u) => u.department_id === deptId);

    return (
      <DepartmentView
        department={department}
        health={null}
        team={[]}
        said={[]}
        critical={[]}
        edges={[]}
        cycleLabel={null}
        roster={unit?.members ?? []}
      />
    );
  }

  /*
   * Two reads of the same week, deliberately. `teamWeek` is the reconciliation
   * counts; `weeklyPersonReports` is what people actually reported. The roster
   * used to render only the first, which is why it read as a flagging screen
   * rather than as a report.
   */
  const [team, said, critical, edges, health] = await Promise.all([
    teamWeek(actor, deptId, week.id),
    weeklyPersonReports(actor, week.id, deptId),
    criticalPath(actor, deptId, week.id),
    blockingEdges(actor, week.id),
    departmentHealth(actor, week.id),
  ]);

  const mine = health.find((h) => h.department_id === deptId) ?? null;

  return (
    <DepartmentView
      department={department}
      health={mine}
      team={team}
      said={said}
      critical={critical}
      edges={edges.filter((e) => e.from_name === department.name)}
      cycleLabel={week.label}
    />
  );
}
