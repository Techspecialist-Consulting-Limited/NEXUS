import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/session";
import {
  CAPABILITY_DETAIL,
  CAPABILITY_LABEL,
  capabilitiesOf,
  hasAdministration,
  type Capability,
} from "@/lib/capabilities";
import { listMembers } from "@/lib/team";
import { ROLE_LABEL } from "@/lib/roles";
import { AdminShell, AdminIndex, ADMIN_PAGES } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

/*
 * What each capability actually allows.
 *
 * Explanation, not a matrix. A grid of ticks tells an administrator which
 * boxes are on; it does not tell them what happens when they turn one on,
 * which is the only question anybody opens this page with.
 *
 * Capability is GRANTED on the People page, next to the person it applies to.
 * Splitting "explain the capability" from "give somebody the capability" is
 * deliberate: the second is a decision about a named colleague and belongs
 * beside their name, not in an abstract permissions editor.
 */

const ORDER: Capability[] = [
  "org_admin",
  "people_admin",
  "department_management",
  "reporting_management",
  "hr_management",
  "department_lead",
  "executive_access",
];

export default async function AdminPermissionsPage() {
  const { membership } = await requireViewer();
  if (!hasAdministration(membership.role)) redirect("/");

  const members = await listMembers(membership.profileId);

  /* Who actually holds each capability today, counted from the roster. */
  const holders = new Map<Capability, string[]>();
  for (const m of members) {
    if (m.status !== "active") continue;
    for (const c of capabilitiesOf(m.role)) {
      holders.set(c, [...(holders.get(c) ?? []), m.full_name]);
    }
  }

  return (
    <AdminShell
      title="Permissions"
      standfirst="Everybody here is a staff member. These are the capabilities layered on top."
    >
      <section className="rounded-lg border border-white/[0.09] bg-white/[0.02] px-4 py-3.5">
        <h2 className="text-sm font-medium text-white/90">One identity, capabilities on top</h2>
        <p className="body-sm mt-1.5">
          An administrator is a staff member. A unit lead is a staff member. HR
          is a staff member. Each of them has their own week to report and their
          own coaching, and additional capability appears on top of that. The
          Chairman is the single exception: he reads the organisation and does
          not file a standup.
        </p>
        {/*
          Stated plainly rather than hidden, because the interface would
          otherwise imply a multi-select that does not exist. Row-level security
          keys on one stored role, and offering a second capability the database
          does not enforce would be a decorative permission — worse than none.
        */}
        <p className="note mt-2.5">
          A person holds one capability at a time today. Granting a second means
          teaching row-level security about a set rather than a single value,
          and until that happens the interface will not offer something the
          database does not enforce.
        </p>
      </section>

      <ul className="flex flex-col gap-2">
        {ORDER.map((capability) => {
          const detail = CAPABILITY_DETAIL[capability];
          const who = holders.get(capability) ?? [];
          return (
            <li
              key={capability}
              className="rounded-lg border border-white/[0.09] bg-white/[0.02] px-4 py-3.5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-sm font-medium text-white/90">
                  {CAPABILITY_LABEL[capability]}
                </h3>
                <span className="note">
                  {who.length === 0
                    ? "Nobody"
                    : who.length <= 3
                      ? who.join(", ")
                      : `${who.slice(0, 2).join(", ")} and ${who.length - 2} others`}
                </span>
              </div>

              <p className="body-sm mt-1.5">{detail.allows}</p>

              <dl className="mt-2.5 grid gap-x-6 gap-y-1.5 sm:grid-cols-[8rem_1fr]">
                <dt className="note">Unlocks</dt>
                <dd className="text-xs text-white/75">{detail.unlocks.join(" · ")}</dd>
                <dt className="note">Can read</dt>
                <dd className="text-xs text-white/75">{detail.reads}</dd>
                <dt className="note">Can change data</dt>
                <dd className="text-xs text-white/75">
                  {detail.writes ? "Yes" : "No — read only"}
                </dd>
              </dl>
            </li>
          );
        })}
      </ul>

      <section className="rounded-lg border border-white/[0.09] bg-white/[0.02] px-4 py-3.5">
        <h2 className="text-sm font-medium text-white/90">How capability is stored</h2>
        <p className="body-sm mt-1.5">
          Each person holds one of {Object.keys(ROLE_LABEL).length} stored roles,
          and that is what row-level security reads on every query. Hiding a
          link is not a permission — a page somebody should not see refuses them
          on the server whether or not the interface offered it.
        </p>
        <p className="note mt-2">Grant capability on the People page, beside the person it applies to.</p>
      </section>

      <AdminIndex items={ADMIN_PAGES} current="/admin/permissions" />
    </AdminShell>
  );
}
