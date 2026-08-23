import { redirect } from "next/navigation";
import { currentActorId } from "@/lib/session";
import { commitmentsFor, getPerson, recentCycles } from "@/lib/queries";
import { CommitmentList } from "@/components/employee/commitment-list";
import { TaskBoard } from "@/components/staff/task-board";

export const dynamic = "force-dynamic";

/** Everything this person has committed to across recent weeks. */
export default async function CommitmentsPage() {
  const actor = await currentActorId();
  const me = await getPerson(actor);
  if (!me) redirect("/");

  const cycles = await recentCycles(actor, 4);
  const weeks = await Promise.all(
    cycles
      .slice()
      .reverse()
      .map(async (c) => ({
        cycle: c,
        commitments: await commitmentsFor(actor, me.id, c.id),
      })),
  );

  const filled = weeks.filter((w) => w.commitments.length > 0);

  /*
   * `weeks` is already newest-first — the map above reverses recentCycles,
   * which returns oldest-first. Reversing again put W30 at the top and the
   * only week anybody can still act on at the bottom.
   */
  if (me.role !== "executive" && me.role !== "admin") {
    return <TaskBoard weeks={filled} />;
  }

  return <CommitmentList weeks={filled} />;
}
