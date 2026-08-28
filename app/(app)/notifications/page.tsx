import { redirect } from "next/navigation";
import { currentActorId } from "@/lib/session";
import { getPerson } from "@/lib/queries";
import { alertsFor } from "@/lib/alerts";
import { NotificationCentre } from "@/components/layout/notification-centre";
import { AlertBoard } from "@/components/executive/alert-board";

export const dynamic = "force-dynamic";

/*
 * The alert centre.
 *
 * The alerts themselves are built by `alertsFor` in lib/alerts.ts, because the
 * bell in the workspace header asks the same question and the two must not be
 * able to answer it differently.
 */
export default async function NotificationsPage() {
  const actor = await currentActorId();
  const me = await getPerson(actor);
  if (!me) redirect("/");

  const { alerts, cycleLabel } = await alertsFor(actor, me);

  /*
   * One board for everybody who is being TOLD things: the Chairman, HR, and
   * staff. The split it draws — needs a decision, worth knowing — is the same
   * question at every altitude, so a second component would be the same
   * layout with different words in it.
   */
  if (me.role !== "admin") {
    return <AlertBoard cycleLabel={cycleLabel} alerts={alerts} />;
  }

  return <NotificationCentre alerts={alerts} role={me.role} />;
}
