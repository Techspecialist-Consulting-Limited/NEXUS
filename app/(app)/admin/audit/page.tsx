import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { requireViewer } from "@/lib/session";
import { hasAdministration } from "@/lib/capabilities";
import { listAuditEvents } from "@/lib/audit";
import { AdminShell, AdminIndex, ADMIN_PAGES } from "@/components/admin/admin-shell";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

/*
 * Who changed what, and when.
 *
 * Read-only, and read-only in the database rather than in this component:
 * `audit_events` has a select policy and an insert policy and nothing else, so
 * RLS refuses an update or a delete from anybody using the application. An
 * audit log the administrator can edit is one nobody should trust.
 */
export default async function AdminAuditPage() {
  const { membership } = await requireViewer();
  if (!hasAdministration(membership.role)) redirect("/");

  const events = await listAuditEvents(membership.profileId);

  return (
    <AdminShell
      title="Audit log"
      standfirst="Administrative changes, most recent first. Nothing here can be edited or removed."
    >
      {events.length === 0 ? (
        <div className="rounded-lg border border-white/[0.09] bg-white/[0.02]">
          <EmptyState
            icon={History}
            title="Nothing recorded yet"
            body="Inviting somebody, changing a capability, or renaming a unit will appear here. Reporting activity is not administrative and is not logged."
          />
        </div>
      ) : (
        <ol className="rounded-lg border border-white/[0.09] bg-white/[0.02]">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1
                         border-b border-white/[0.05] px-4 py-3 last:border-b-0"
            >
              <p className="min-w-0 flex-1 text-sm text-white/85">{event.summary}</p>
              {/*
                Absolute, not "3 days ago". This is the surface somebody reads
                when reconstructing what happened, and a relative time forces
                them to work out the date from the day they happen to be
                reading it.
              */}
              <time
                dateTime={event.created_at}
                className="metric shrink-0 text-2xs text-tertiary"
              >
                {new Date(event.created_at).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </li>
          ))}
        </ol>
      )}

      <AdminIndex items={ADMIN_PAGES} current="/admin/audit" />
    </AdminShell>
  );
}
