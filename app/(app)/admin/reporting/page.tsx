import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/session";
import { hasAdministration } from "@/lib/capabilities";
import { organizationProfile } from "@/lib/organization";
import { rhythmFor } from "@/lib/rhythm";
import { AdminShell, AdminIndex, ADMIN_PAGES } from "@/components/admin/admin-shell";
import { RhythmForm } from "@/components/admin/rhythm-form";

export const dynamic = "force-dynamic";

/*
 * The reporting rhythm.
 *
 * Every control on this page does something. That was not true a pass ago:
 * NEXUS did not decide its own timing, so a time picker would have stored a
 * preference nothing read — and a control that appears to work and does not is
 * worse than no control.
 *
 * `lib/rhythm.ts` now gates each job on these values, per organisation, in the
 * organisation's own timezone. The scheduler ticks; the gate decides when.
 */
export default async function AdminReportingPage() {
  const { membership } = await requireViewer();
  if (!hasAdministration(membership.role)) redirect("/");

  const [org, rhythm] = await Promise.all([
    organizationProfile(membership.profileId),
    rhythmFor(membership.profileId),
  ]);

  return (
    <AdminShell
      title="Reporting"
      standfirst="When the week opens, when NEXUS chases, and when the Chairman is briefed."
    >
      <RhythmForm rhythm={rhythm} timezone={org?.timezone ?? "UTC"} />

      <section className="rounded-lg border border-white/[0.09] bg-white/[0.02]">
        <div className="border-b border-white/[0.07] px-4 py-3.5">
          <h2 className="text-base font-medium text-white/90">What NEXUS runs</h2>
          <p className="note mt-1">
            In this order. Each step is idempotent, so running twice cannot
            double-send.
          </p>
        </div>
        <ol className="px-4 py-2">
          {[
            [
              "Open the week",
              "A check-in for everybody who reports — that is everybody but the Chairman.",
              "Scheduled",
            ],
            [
              "Chase",
              "Only people who have not answered. Anybody who reported hears nothing further.",
              "Scheduled",
            ],
            [
              "Write the readouts",
              "Each person's weekly narrative and coaching, so nobody waits on a model when they open their week.",
              "Every run",
            ],
            [
              "Find what matters",
              "Blockers, repeated carryovers, silent drops, and who needs support.",
              "Every run",
            ],
            ["Build the brief", "One per organisation, from figures counted in SQL.", "Scheduled"],
            [
              "Send it",
              "Email to the Chairman, checked against sent_at so a retry does not send twice.",
              "When one is waiting",
            ],
          ].map(([label, detail, when], i) => (
            <li
              key={label}
              className="flex gap-3 border-b border-white/[0.05] py-3 last:border-b-0"
            >
              <span className="metric mt-px shrink-0 text-2xs text-tertiary">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/85">{label}</p>
                <p className="note mt-0.5">{detail}</p>
              </div>
              {/*
                Which steps the schedule governs and which run every time. The
                two that produce nothing anybody receives — a cached readout and
                a set of findings — are not held back, because delaying them
                schedules nothing and only means somebody waits on a model.
              */}
              <span className="note shrink-0">{when}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-lg border border-white/[0.09] bg-white/[0.02] px-4 py-3.5">
        <h2 className="text-sm font-medium text-white/90">How it is triggered</h2>
        <p className="body-sm mt-1.5">
          Point a scheduler at{" "}
          <code className="rounded bg-white/[0.07] px-1 py-0.5 text-xs">
            POST /api/cron/tick
          </code>{" "}
          <strong>every hour</strong>, authorised with the{" "}
          <code className="rounded bg-white/[0.07] px-1 py-0.5 text-xs">CRON_SECRET</code>{" "}
          bearer token. NEXUS decides what is due from the times above, so an
          hourly tick is not an hourly rhythm — it is how the rhythm gets
          noticed on time.
        </p>
        <p className="note mt-2">
          Naming one job —{" "}
          <code className="rounded bg-white/[0.07] px-1 py-0.5 text-xs">?job=digest</code>{" "}
          — runs it immediately and ignores the schedule. That is the manual run.
        </p>
      </section>

      <AdminIndex items={ADMIN_PAGES} current="/admin/reporting" />
    </AdminShell>
  );
}
