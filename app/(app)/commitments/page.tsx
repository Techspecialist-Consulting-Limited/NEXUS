import { redirect } from "next/navigation";
import { currentActorId } from "@/lib/session";
import { commitmentsFor, cyclesWithWork, getPerson } from "@/lib/queries";
import { CommitmentList } from "@/components/employee/commitment-list";
import { TasksWorkspace } from "@/components/tasks/tasks-workspace";
import { hasPersonalWorkspace } from "@/lib/capabilities";

export const dynamic = "force-dynamic";

/** Everything this person has committed to across recent weeks. */
export default async function CommitmentsPage() {
  const actor = await currentActorId();
  const me = await getPerson(actor);
  if (!me) redirect("/");

  /*
   * The weeks this person HAS work in, rather than a guessed window of the
   * calendar.
   *
   * recentCycles excludes the current week, so this page could not see work
   * targeting it — and a report filed on the week that just ended puts its
   * plans in exactly that week. Somebody submitted successfully and then found
   * "Nothing recorded yet" while three commitments sat in the database,
   * because the page had asked about four weeks that were not the one holding
   * their work.
   */
  const cycles = await cyclesWithWork(actor, me.id, 6);
  const weeks = await Promise.all(
    cycles.map(async (c) => ({
      cycle: c,
      commitments: await commitmentsFor(actor, me.id, c.id),
    })),
  );

  const filled = weeks.filter((w) => w.commitments.length > 0);

  /*
   * An administrator is a staff member with extra capability, not a different
   * kind of user, so they get the staff board like everybody else who files a
   * check-in. This branched on role and sent admins to the read-only list —
   * inconsistent with /my-week, which has always used hasPersonalWorkspace.
   * Only the Chairman, who files nothing, gets the other view.
   */
  if (hasPersonalWorkspace(me.role)) {
    return <TasksWorkspace person={me} weeks={filled} />;
  }

  return <CommitmentList weeks={filled} />;
}
