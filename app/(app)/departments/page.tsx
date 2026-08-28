import { redirect } from "next/navigation";
import { currentActorId } from "@/lib/session";
import {
  departmentHealth,
  getPerson,
  latestVisibleCycle,
  unitRoster,
} from "@/lib/queries";
import { weekRange } from "@/lib/cycle";
import { UnitList } from "@/components/dashboard/unit-list";
import { UnitBoard } from "@/components/executive/unit-board";
import { UnitRoster } from "@/components/executive/unit-roster";

export const dynamic = "force-dynamic";

/**
 * Every unit the viewer may see.
 *
 * TWO QUESTIONS, AND ONLY ONE OF THEM NEEDS A SETTLED WEEK.
 *
 * "How is each unit doing" comes from department_cycle_health, which exists
 * per cycle — so before the first week settles there is genuinely nothing to
 * say. This page used to stop there: no week, no page, an empty state reading
 * "No settled weeks yet" and not one of the units the Chairman had created.
 *
 * "What units are there, and who is in them" is true from the moment somebody
 * creates one, and it is the question being asked while an organisation is
 * still being set up. So the roster renders either way — alone before the
 * first week settles, and beneath the health board afterwards, where it also
 * answers "who is actually in this unit" for a reader looking at a figure and
 * wondering who it covers.
 */
export default async function DepartmentsPage() {
  const actor = await currentActorId();
  const me = await getPerson(actor);
  if (!me) redirect("/");

  const [week, roster] = await Promise.all([
    latestVisibleCycle(actor),
    unitRoster(actor),
  ]);

  if (!week) {
    return (
      <div className="pt-2">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Units</h1>
          {/*
            Says what is missing, why it matters, and what changes it — the
            three things an administrative empty state owes the reader.
            "No settled weeks yet" managed only the first.
          */}
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-secondary">
            Delivery, signal and carryover figures appear here once a reporting
            week has settled. The units themselves, and who is in them, are
            below.
          </p>
        </div>

        <div className="mt-5">
          <UnitRoster roster={roster} heading={false} />
        </div>
      </div>
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
    return (
      <div className="flex flex-col gap-6">
        <UnitBoard cycleLabel={week.label} departments={departments} />
        <UnitRoster roster={roster} />
      </div>
    );
  }

  return (
    <div className="pt-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Units</h1>
          <p className="mt-0.5 text-xs text-secondary">{weekRange(week.label)}</p>
        </div>
      </div>

      {departments.length > 0 && (
        <div className="mt-4">
          <UnitList departments={departments} variant="grid" />
        </div>
      )}

      <div className="mt-6">
        <UnitRoster roster={roster} />
      </div>
    </div>
  );
}
