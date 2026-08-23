import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/auth";
import { describeIdentity, hasPersonalWorkspace } from "@/lib/capabilities";
import { personalSettings } from "@/lib/profile-settings";
import { SettingsPanel } from "@/components/settings/settings-panel";

export const dynamic = "force-dynamic";

/*
 * Profile & Settings — the individual.
 *
 * Deliberately NOT under /admin. Administration configures the organisation;
 * this configures the person, and every member of the organisation has one
 * whether or not they can administer anything. Putting a staff member's quiet
 * hours behind an administrative route would be the identity model backwards.
 */

/**
 * Who can see what, from the rules the database actually enforces.
 *
 * Written on the server from the real policies rather than kept as marketing
 * copy in a component, because the value of a privacy section is entirely in
 * whether it is true. Every line here maps to a policy in 0006 or 0008.
 */
function privacyLines(hasWeek: boolean): string[] {
  const lines = [
    "The exact words you write in a check-in are readable by you and nobody else. Not your lead, not HR, not the Chairman — it is a row filter, not a setting.",
    "Your reconciliation reaches your lead only after you have seen it and the correction window has passed. That is the whole point of the window.",
    "Your lead sees your unit's weeks. They do not see another unit's.",
    "HR sees whether you reported and when, across the organisation. They do not see what you wrote.",
    "The Chairman sees figures and findings for the organisation and can drill into any unit. He does not see your raw words.",
    "Blocked work is excluded from your delivery score, so declaring a dependency never counts against you.",
  ];
  if (!hasWeek) {
    return [
      "You do not file a weekly standup, so there is no check-in text of yours for anybody to read.",
      ...lines.slice(2),
    ];
  }
  return lines;
}

export default async function SettingsPage() {
  const { membership } = await requireViewer();
  const settings = await personalSettings(membership.profileId);

  /*
   * No profile row means no membership, which requireViewer already refuses —
   * so this is a race rather than a state, and the honest answer is to start
   * again rather than render half a page.
   */
  if (!settings) redirect("/");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-4">
      <header>
        <h1 className="page-title">Profile &amp; settings</h1>
        <p className="standfirst mt-1.5">
          Your own details, when NEXUS may reach you, and what it may send.
        </p>
      </header>

      <SettingsPanel
        settings={settings}
        roleLabel={ROLE_LABEL[membership.role]}
        identityLine={describeIdentity(membership.role)}
        privacy={privacyLines(hasPersonalWorkspace(membership.role))}
        canReplayIntro={hasPersonalWorkspace(membership.role)}
      />
    </div>
  );
}
