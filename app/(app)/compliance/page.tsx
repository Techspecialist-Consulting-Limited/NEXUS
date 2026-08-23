import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/session";
import { canSeeOrg } from "@/lib/auth";
import { latestVisibleCycle, recentCycles } from "@/lib/queries";
import { reportingCompliance } from "@/lib/team";
import { ComplianceView } from "@/components/team/compliance-view";
import { ReportingBoard } from "@/components/hr/reporting-board";

export const dynamic = "force-dynamic";

/*
 * PRD F18 — HR's view: who submitted, who was late, who did not.
 *
 * Uses the current reporting week rather than the last settled one: chasing a
 * non-submitter is only useful while the week is still open.
 */
export default async function CompliancePage() {
  const { membership } = await requireViewer();
  if (!canSeeOrg(membership.role)) redirect("/");

  const cycles = await recentCycles(membership.profileId, 2);
  const week = cycles.at(-1) ?? (await latestVisibleCycle(membership.profileId));
  if (!week) {
    return (
      <p className="py-16 text-center text-sm text-secondary">
        No reporting week is open yet.
      </p>
    );
  }

  const rows = await reportingCompliance(membership.profileId, week.id);

  /*
   * HR gets the one-view board; leads and admins keep the analytical view.
   * HR arrives to answer "who do I chase", so the board ranks by that and
   * says it in words.
   */
  if (membership.role === "hr") {
    return <ReportingBoard cycleLabel={week.label} rows={rows} />;
  }

  return <ComplianceView cycleLabel={week.label} rows={rows} />;
}
