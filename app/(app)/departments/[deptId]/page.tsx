import { notFound, redirect } from "next/navigation";
import { currentActorId } from "@/lib/session";
import {
  blockingEdges,
  commitmentsForDepartment,
  criticalPath,
  departmentHealth,
  getDepartment,
  getPerson,
  latestVisibleCycle,
  recentCycles,
  teamWeek,
  unitRoster,
  weeklyPersonReports,
} from "@/lib/queries";
import { DepartmentView } from "@/components/dashboard/department-view";
import { CommitmentBoard } from "@/components/executive/commitment-board";

export const dynamic = "force-dynamic";

/*
 * GUIDE §12 Department Drill-Down.
 *
 * TWO SHAPES, ONE ROUTE. Same split as `/departments`: the Chairman gets the
 * commitment board, everybody else keeps `DepartmentView` — "who needs
 * support" framing, ordered by who is struggling. Access is RLS either way;
 * the branch below only decides which shape of the same data to draw.
 */
export default async function DepartmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ deptId: string }>;
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { deptId } = await params;
  const { cycle: cycleParam } = await searchParams;
  const actor = await currentActorId();

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
   *
   * These three reads don't depend on each other's results, only on `actor`
   * and `deptId` — batched rather than three sequential round trips.
   */
  const [me, department, latest] = await Promise.all([
    getPerson(actor),
    getDepartment(actor, deptId),
    latestVisibleCycle(actor),
  ]);
  if (!me) redirect("/");
  if (!department) notFound();

  if (!latest) {
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

    if (me.role === "executive") {
      return (
        <CommitmentBoard
          department={department}
          cycleLabel={null}
          rows={[]}
          edges={[]}
          roster={unit?.members ?? []}
        />
      );
    }

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

  if (me.role === "executive") {
    /*
     * The last four settled weeks, most recent first. `recentCycles` excludes
     * the current calendar week by construction, but `latest` — the most
     * recent SETTLED one — is always fully elapsed, so it is always among
     * these rows as long as the pool is wide enough; 8 is comfortable margin
     * for four consecutive settled weeks even across a gap in reporting.
     */
    const pool = await recentCycles(actor, 8);
    const weeks = pool
      .filter((c) => c.seq <= latest.seq)
      .sort((a, b) => b.seq - a.seq)
      .slice(0, 4);

    const selected = weeks.find((c) => c.id === cycleParam) ?? latest;

    const [rows, edges] = await Promise.all([
      commitmentsForDepartment(actor, deptId, selected.id),
      blockingEdges(actor, selected.id),
    ]);

    return (
      <CommitmentBoard
        department={department}
        cycleLabel={selected.label}
        rows={rows}
        edges={edges.filter((e) => e.from_name === department.name)}
        weeks={weeks.map((c) => ({ id: c.id, label: c.label }))}
        selectedCycleId={selected.id}
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
    teamWeek(actor, deptId, latest.id),
    weeklyPersonReports(actor, latest.id, deptId),
    criticalPath(actor, deptId, latest.id),
    blockingEdges(actor, latest.id),
    departmentHealth(actor, latest.id),
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
      cycleLabel={latest.label}
    />
  );
}
