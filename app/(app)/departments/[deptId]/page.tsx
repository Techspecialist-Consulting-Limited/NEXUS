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

  const week = await latestVisibleCycle(actor);
  if (!week) notFound();

  const department = await getDepartment(actor, deptId);
  if (!department) notFound();

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
