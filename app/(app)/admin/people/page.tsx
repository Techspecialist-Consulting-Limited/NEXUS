import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/session";
import { hasAdministration } from "@/lib/capabilities";
import { listDepartments, listInvitations, listMembers } from "@/lib/team";
import { AdminShell, AdminIndex, ADMIN_PAGES } from "@/components/admin/admin-shell";
import { TeamManager } from "@/components/team/team-manager";

export const dynamic = "force-dynamic";

/*
 * People.
 *
 * This is the page /team already was — invite, place, and set capability — now
 * living inside Administration where an administrator looks for it. The
 * existing manager is reused rather than rebuilt: it already handles
 * invitations, roles, departments and status, and a second implementation of
 * the same four things is two places to fix the next bug.
 *
 * /team still resolves and redirects here, so any link or bookmark survives.
 */
export default async function AdminPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  const { membership } = await requireViewer();
  if (!hasAdministration(membership.role)) redirect("/");

  const [members, invitations, departments] = await Promise.all([
    listMembers(membership.profileId),
    listInvitations(membership.profileId),
    listDepartments(membership.profileId),
  ]);

  return (
    <AdminShell
      title="People"
      standfirst="Everybody in the organisation, who they report with, and what they can do."
    >
      <TeamManager
        orgName={membership.orgName}
        selfId={membership.profileId}
        members={members}
        invitations={invitations}
        departments={departments}
        welcome={welcome === "1"}
      />
      <AdminIndex items={ADMIN_PAGES} current="/admin/people" />
    </AdminShell>
  );
}
