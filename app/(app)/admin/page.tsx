import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/session";
import { hasAdministration } from "@/lib/capabilities";
import { organizationReadiness } from "@/lib/readiness";
import { AdminShell, AdminIndex, ADMIN_PAGES } from "@/components/admin/admin-shell";
import { ReadinessBoard } from "@/components/admin/readiness-board";
import { OrganizationForm } from "@/components/admin/organization-form";
import { organizationProfile } from "@/lib/organization";

export const dynamic = "force-dynamic";

/*
 * Administration home.
 *
 * It answers one question — is this organisation configured correctly? — and
 * it is deliberately not a dashboard. No KPI grid, no charts, no staff
 * performance figures: an administrator arriving here wants to know what is
 * unfinished and where to finish it.
 *
 * The organisation profile lives on this page rather than on one of its own,
 * because "name, timezone, working days" is six fields and a page containing
 * six fields is a page somebody has to remember exists.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  const { membership } = await requireViewer();

  /*
   * Checked on the server, not by hiding a link. A capability the interface
   * declines to show is still a route somebody can type.
   */
  if (!hasAdministration(membership.role)) redirect("/");

  const [readiness, org] = await Promise.all([
    organizationReadiness(membership.profileId),
    organizationProfile(membership.profileId),
  ]);

  return (
    <AdminShell
      title="Organization"
      standfirst={`Configure ${membership.orgName} and see what is left to set up.`}
    >
      {/*
        Shown once, to the person who just created the organisation. They have
        nothing to manage yet and seven things to do, so the first thing they
        see should say what this page is for rather than assume they know.
      */}
      {welcome === "1" && (
        <p className="rounded-lg border border-[var(--dept-techspecialist)]/25
                      bg-[var(--dept-techspecialist)]/[0.06] px-4 py-3 text-sm text-white/85">
          {membership.orgName} exists. Work down this list and NEXUS starts
          doing something useful — you can stop at any point and come back.
        </p>
      )}

      <ReadinessBoard readiness={readiness} />
      {org && <OrganizationForm org={org} />}
      <AdminIndex items={ADMIN_PAGES} current="/admin" />
    </AdminShell>
  );
}
