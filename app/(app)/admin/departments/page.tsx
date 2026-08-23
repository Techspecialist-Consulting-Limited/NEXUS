import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/session";
import { hasAdministration } from "@/lib/capabilities";
import { assignableMembers, listDepartmentsDetailed } from "@/lib/departments";
import { AdminShell, AdminIndex, ADMIN_PAGES } from "@/components/admin/admin-shell";
import { DepartmentsManager } from "@/components/admin/departments-manager";

export const dynamic = "force-dynamic";

/** Units, their leads and who is in them. */
export default async function AdminDepartmentsPage() {
  const { membership } = await requireViewer();
  if (!hasAdministration(membership.role)) redirect("/");

  const [departments, members] = await Promise.all([
    listDepartmentsDetailed(membership.profileId),
    assignableMembers(membership.profileId),
  ]);

  return (
    <AdminShell
      title="Departments"
      standfirst="How the organisation is structured. NEXUS groups reporting by unit, and points at a unit's lead when its work is blocked."
    >
      <DepartmentsManager departments={departments} members={members} />
      <AdminIndex items={ADMIN_PAGES} current="/admin/departments" />
    </AdminShell>
  );
}
