import { redirect } from "next/navigation";
import { currentActorId } from "@/lib/session";
import {
  criticalPath,
  departmentHealth,
  getPerson,
  latestVisibleCycle,
  teamWeek,
} from "@/lib/queries";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";
import { TeamBoard } from "@/components/lead/team-board";

export const dynamic = "force-dynamic";

/*
 * A lead's own unit, at a fixed address.
 *
 * The department view already existed at /departments/[id], but nothing in the
 * product linked a lead to their own — so the people they are responsible for
 * were reachable only by guessing a URL. Navigation needs a stable href, and
 * "whichever department this person leads" is not one, so it resolves here.
 *
 * Everything reads through RLS as the lead. A lead who somehow reached another
 * unit's id would get that unit's policies, not this page's good intentions.
 */
export default async function MyTeamPage() {
  const actor = await currentActorId();
  const me = await getPerson(actor);
  if (!me) redirect("/");

  if (!me.department_id) {
    return (
      <GlassCard level={1} className="mt-4">
        <EmptyState
          icon={Users}
          title="You do not lead a unit yet"
          body="Once you are placed in a department, your team appears here."
        />
      </GlassCard>
    );
  }

  /*
   * The last SETTLED week, not the current one.
   *
   * A team view of a week still inside the correction window would show a lead
   * numbers their own people have not seen and had no chance to correct —
   * which is the promise this product makes to the people it reports on, and
   * the one place a manager screen could quietly break it.
   */
  const week = await latestVisibleCycle(actor);
  if (!week) {
    return (
      <GlassCard level={1} className="mt-4">
        <EmptyState
          icon={Users}
          title="No settled week yet"
          body="Your team appears here once people have confirmed their week."
        />
      </GlassCard>
    );
  }

  const [team, critical, health] = await Promise.all([
    teamWeek(actor, me.department_id, week.id),
    criticalPath(actor, me.department_id, week.id),
    departmentHealth(actor, week.id),
  ]);

  return (
    <TeamBoard
      unitName={me.department_name ?? "My team"}
      cycleLabel={week.label}
      health={health.find((h) => h.department_id === me.department_id) ?? null}
      team={team}
      critical={critical}
    />
  );
}
