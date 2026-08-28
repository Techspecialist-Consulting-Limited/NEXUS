import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { hasAdministration } from "@/lib/capabilities";
import type { OrgRole } from "@/lib/roles";
import { currentActorId } from "@/lib/session";
import {
  coursePlot,
  departmentHealth,
  getPerson,
  latestVisibleCycle,
  latestWeeklyBrief,
  pendingReview,
  recentCycles,
  recentStaffUpdates,
  unitRoster,
} from "@/lib/queries";
import { reportingCompliance } from "@/lib/team";
import { executiveBrief } from "@/lib/insights";
import { CommandCenter } from "@/components/dashboard/command-center";
import { ExecutiveHome } from "@/components/dashboard/executive-home";
import { HrOverview } from "@/components/hr/overview-home";

export const dynamic = "force-dynamic";

/*
 * The command view.
 *
 * The Chairman gets ExecutiveHome: ask, who moved, what needs you, where to
 * go. HR gets HrOverview: who has not reported this week, then delivery as
 * context — a different job, not a smaller version of the same one. Admins
 * keep the analytical CommandCenter, because they came to inspect the numbers
 * rather than to be briefed on them.
 *
 * The week shown is the latest one this viewer may SEE, which is normally one
 * behind the calendar: the current week is still inside the employees'
 * correction window. Rather than hide that, the page says so — a Chairman who
 * understands why last week is the newest settled week is a Chairman who
 * trusts the numbers when they do arrive.
 */

/*
 * What to say when no reporting week has settled.
 *
 * Three rules, from the brief for administrative empty states: say what is
 * missing, say why it matters, and give the next action. "No data" fails all
 * three, and "No settled weeks yet" only manages the first.
 */
function NothingSettledYet({ role }: { role: OrgRole }) {
  if (hasAdministration(role)) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <EmptyState
          icon={CalendarClock}
          title="No reporting week has settled yet"
          body="Delivery figures, coaching and the executive brief all appear once a week has been reported and confirmed. Until then there is nothing counted to show. Finish setting up, and the first week will fill this in."
          action={
            <Link
              href="/admin"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[var(--dept-techspecialist)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Continue setup <ArrowRight size={14} aria-hidden="true" />
            </Link>
          }
        />
      </div>
    );
  }

  if (role === "hr") {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <EmptyState
          icon={CalendarClock}
          title="No reporting week has settled yet"
          body="Compliance figures come from confirmed reconciliations, and none exist yet. Once people start reporting, this fills in — and who has not reported appears on Reporting."
          action={
            <Link
              href="/compliance"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-white/[0.12] px-4 text-sm text-white/85 transition-colors hover:bg-white/[0.06]"
            >
              Open Reporting <ArrowRight size={14} aria-hidden="true" />
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-10">
      <EmptyState
        icon={CalendarClock}
        title="No reporting week has settled yet"
        body="Your brief is built from weeks people have reported and confirmed. The first one arrives after the first reporting cycle closes — nothing is missing, it is simply early."
      />
    </div>
  );
}

function partOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const actor = await currentActorId();
  const me = await getPerson(actor);
  if (!me) redirect("/");

  const week = await latestVisibleCycle(actor);

  /*
   * A brand-new organisation has no settled week, and this page used to say so
   * in one flat sentence and then stop — which is what an administrator saw
   * the very first time they signed in. It is a fair statement of fact and a
   * dead end: it does not say why there is nothing, what would change it, or
   * where to go.
   *
   * The answer differs by who is asking, so it is answered by who is asking.
   * An administrator has setup left to do; HR has nobody to chase yet; the
   * Chairman is simply early.
   */
  if (!week) {
    return <NothingSettledYet role={me.role} />;
  }

  const isChairman = me.role === "executive";

  if (isChairman) {
    /*
     * The weekly brief is the STORED digest, read here and passed down as
     * plain props. Null when none has been sent, which is the whole of the
     * empty state: no brief, no modal.
     */
    const [brief, updates, weekly, roster, compliance] = await Promise.all([
      executiveBrief(actor, week.id),
      recentStaffUpdates(actor, week.id),
      latestWeeklyBrief(actor),
      /*
       * The organisation's shape, read without a cycle. Units exist from the
       * moment somebody creates them, which is long before the first check-in
       * — and a Chairman invited during setup should see what has been built
       * rather than a page of blanks.
       */
      unitRoster(actor),
      /*
       * Who was expected to file and who has. Without these two numbers the
       * page cannot tell "nothing needed you" from "nobody reported", and it
       * used to render the first sentence for both.
       */
      reportingCompliance(actor, week.id),
    ]);

    return (
      <ExecutiveHome
        firstName={me.full_name.split(/\s+/)[0]}
        greeting={partOfDay()}
        today={new Date().toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
        cycleLabel={week.label}
        insights={brief.insights}
        updates={updates}
        roster={roster}
        reporting={{
          expected: compliance.length,
          submitted: compliance.filter((r) => r.submitted).length,
        }}
        weeklyBrief={weekly}
      />
    );
  }

  if (me.role === "hr") {
    /*
     * Two weeks, deliberately.
     *
     * Chasing acts on the OPEN week — a reminder about a closed one is
     * useless. Delivery figures only exist for the SETTLED week, because the
     * current one is still inside the employees' correction window. HR needs
     * both, and the view labels which is which.
     */
    const cycles = await recentCycles(actor, 2);
    const openWeek = cycles.at(-1) ?? week;

    const [compliance, departments] = await Promise.all([
      reportingCompliance(actor, openWeek.id),
      departmentHealth(actor, week.id),
    ]);

    return (
      <HrOverview
        openWeekLabel={openWeek.label}
        settledWeekLabel={week.label}
        compliance={compliance}
        departments={departments}
      />
    );
  }

  const [brief, course, pending] = await Promise.all([
    executiveBrief(actor, week.id),
    coursePlot(actor),
    pendingReview(week.seq),
  ]);

  return (
    <CommandCenter
      viewerRole={me.role}
      cycleLabel={week.label}
      brief={brief}
      course={course}
      pending={pending}
    />
  );
}
