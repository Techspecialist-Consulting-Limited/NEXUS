import { redirect } from "next/navigation";
import { currentActorId } from "@/lib/session";
import {
  commitmentsFor,
  currentCycle,
  cyclesWithWork,
  getPerson,
} from "@/lib/queries";
import { alertsFor } from "@/lib/alerts";
import { CommitmentList } from "@/components/employee/commitment-list";
import { TasksWorkspace } from "@/components/tasks/tasks-workspace";
import { hasPersonalWorkspace } from "@/lib/capabilities";

export const dynamic = "force-dynamic";

/**
 * Everything this person has committed to across recent weeks.
 *
 * `?task=<id>` opens that commitment's detail. It exists because a commitment
 * had no address: the detail was local state on this page, so nothing could
 * link to one — not the "What you're working on" card on My Week, not an
 * alert, not a message to a colleague. A row you can press and cannot link to
 * is only half a target.
 */
export default async function CommitmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string | string[] }>;
}) {
  const actor = await currentActorId();
  const { task } = await searchParams;
  const openTaskId = typeof task === "string" ? task : null;
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
  const [withWork, current, feed] = await Promise.all([
    cyclesWithWork(actor, me.id, 6),
    currentCycle(actor),
    // The same list /notifications builds, for the bell in the header.
    alertsFor(actor, me),
  ]);

  /*
   * THE CURRENT WEEK IS ALWAYS IN THE LIST, even with nothing in it.
   *
   * `cyclesWithWork` returns only weeks that HAVE commitments, so the workspace
   * headed its first entry "THIS WEEK" and showed whatever the newest week with
   * work happened to be. On 28 August that read "THIS WEEK · 17 Aug–23 Aug".
   *
   * A week with nothing promised in it is a fact worth showing — it is the
   * week you are in — and it is the one an empty state should be about.
   */
  const cycles =
    current && !withWork.some((c) => c.id === current.id)
      ? [current, ...withWork]
      : withWork;

  const weeks = await Promise.all(
    cycles.map(async (c) => ({
      cycle: c,
      commitments: await commitmentsFor(actor, me.id, c.id),
    })),
  );

  // Empty weeks are noise in the history; the current one is the exception.
  const filled = weeks.filter(
    (w) => w.commitments.length > 0 || w.cycle.id === current?.id,
  );

  /*
   * An administrator is a staff member with extra capability, not a different
   * kind of user, so they get the staff board like everybody else who files a
   * check-in. This branched on role and sent admins to the read-only list —
   * inconsistent with /my-week, which has always used hasPersonalWorkspace.
   * Only the Chairman, who files nothing, gets the other view.
   */
  if (hasPersonalWorkspace(me.role)) {
    return (
      <TasksWorkspace
        person={me}
        weeks={filled}
        currentCycleId={current?.id ?? null}
        openTaskId={openTaskId}
        alerts={feed.alerts}
      />
    );
  }

  return <CommitmentList weeks={filled} />;
}
