import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/session";
import { hasAdministration } from "@/lib/capabilities";
import { allOrganizations } from "@/lib/organizations";
import { AdminShell } from "@/components/admin/admin-shell";
import { OrganizationsManager } from "@/components/admin/organizations-manager";

export const dynamic = "force-dynamic";

/*
 * The organisation directory.
 *
 * Every organisation in the database, and the one place a whole one can be
 * removed. It exists because a pilot has to be torn down and rebuilt, and the
 * alternative — hand-written SQL against production every time somebody wants
 * a clean slate — is both slower and far more dangerous than a screen that
 * says exactly what it is about to delete.
 *
 * IT DELIBERATELY IGNORES ROW-LEVEL SECURITY, because listing organisations
 * you are not in is the entire point. The guard is the capability check below
 * and the same check in the route; the caveat is written on the page itself,
 * where the person who needs to read it will. See lib/organizations.ts.
 */
export default async function AdminOrganizationsPage() {
  const { membership } = await requireViewer();

  /*
   * Checked on the server, not by hiding a link. A capability the interface
   * declines to show is still a route somebody can type — and this one deletes
   * organisations.
   */
  if (!hasAdministration(membership.role)) redirect("/");

  const organizations = await allOrganizations();

  return (
    <AdminShell
      title="Organizations"
      standfirst="Every organisation in this deployment, and what is inside each one. Deleting one removes it and everything under it, permanently."
    >
      <OrganizationsManager
        organizations={organizations}
        currentOrgId={membership.orgId}
      />
    </AdminShell>
  );
}
