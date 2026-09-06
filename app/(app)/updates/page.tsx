import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/session";
import { canSeeOrg } from "@/lib/auth";
import { latestVisibleCycle, recentStaffUpdates } from "@/lib/queries";
import { reportingCompliance } from "@/lib/team";
import { AllUpdates } from "@/components/dashboard/all-updates";

export const dynamic = "force-dynamic";

/*
 * Every report for the last settled week, in one place — reached from the
 * Chairman's "Recent updates" card, which used to send "View all" to
 * /departments (the unit list) because nothing else existed to send it to.
 *
 * NOT /compliance. That page's data source (`submission_status`, migration
 * 0009) is deliberately incapable of carrying content — its own comment says
 * "compliance needs to know somebody reported, not what they said". This page
 * exists to show what they said, so it needed a different source: the same
 * `recentStaffUpdates` the dashboard card already reads, which is safe to
 * show because it comes from `commitments.source_quote` — what somebody chose
 * to publish — never the raw check-in text.
 *
 * Reuses `reportingCompliance` for who is expected to have reported and
 * whether they did — the exact question /compliance already answers
 * correctly — merged with the quote each of them actually published.
 */
export default async function UpdatesPage() {
  const { membership } = await requireViewer();
  if (!canSeeOrg(membership.role)) redirect("/");

  const week = await latestVisibleCycle(membership.profileId);
  if (!week) {
    return (
      <p className="py-16 text-center text-sm text-secondary">
        No reporting week has settled yet.
      </p>
    );
  }

  const [compliance, staffUpdates] = await Promise.all([
    reportingCompliance(membership.profileId, week.id),
    /*
     * No real cap — this page's whole job is "everyone", not a top few.
     * `recentStaffUpdates` already dedupes to one row per person.
     */
    recentStaffUpdates(membership.profileId, week.id, 500),
  ]);

  const updateByProfile = new Map(staffUpdates.map((u) => [u.profile_id, u]));

  const rows = compliance.map((c) => ({
    ...c,
    update: updateByProfile.get(c.profile_id) ?? null,
  }));

  return <AllUpdates cycleLabel={week.label} rows={rows} />;
}
