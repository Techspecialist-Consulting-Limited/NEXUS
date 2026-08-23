import { redirect } from "next/navigation";
import { currentActorId } from "@/lib/session";
import { departmentHealth, getPerson, latestVisibleCycle } from "@/lib/queries";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState } from "@/components/ui/empty-state";
import { weekCode, weekRange } from "@/lib/cycle";
import { Building2 } from "lucide-react";
import { UnitList } from "@/components/dashboard/unit-list";
import { UnitBoard } from "@/components/executive/unit-board";

export const dynamic = "force-dynamic";

/** Every unit the viewer may see, ranked by delivery. */
export default async function DepartmentsPage() {
  const actor = await currentActorId();
  const me = await getPerson(actor);
  if (!me) redirect("/");

  const week = await latestVisibleCycle(actor);
  if (!week) {
    return (
      <GlassCard level={1} className="mt-4">
        <EmptyState
          icon={Building2}
          title="No settled weeks yet"
          body="Unit health appears once employees have confirmed their week."
        />
      </GlassCard>
    );
  }

  const departments = await departmentHealth(actor, week.id);

  /*
   * The Chairman gets the one-view board; leads keep the grid.
   *
   * Same data, different job. He is scanning five units for the one that needs
   * a conversation, so the board ranks by who needs help and states it in
   * words. A lead sees one or two units and wants the numbers laid out.
   */
  if (me.role === "executive" && departments.length > 0) {
    return <UnitBoard cycleLabel={week.label} departments={departments} />;
  }

  return (
    <div className="pt-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Units</h1>
          <p className="mt-0.5 text-xs text-tertiary">{weekRange(week.label)}</p>
        </div>
        <span className="metric shrink-0 rounded-md bg-white/[0.06] px-2 py-1 text-xs text-white/70">
          {weekCode(week.label)}
        </span>
      </div>

      {departments.length === 0 ? (
        <GlassCard level={1} className="mt-4">
          <EmptyState
            icon={Building2}
            title="Nothing visible here"
            body="You can see units you lead, and the organisation-wide view is limited to the Chairman."
          />
        </GlassCard>
      ) : (
        <div className="mt-4">
          <UnitList departments={departments} variant="grid" />
        </div>
      )}
    </div>
  );
}
