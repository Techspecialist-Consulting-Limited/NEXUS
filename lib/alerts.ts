import { asActor } from "./db";
import { latestVisibleCycle, recentCycles } from "./queries";
import type { Person } from "./queries";
import { weeklyBrief } from "./coach";
import { reportingCompliance } from "./team";
import { executiveBrief } from "./insights";

/*
 * What is waiting on one person, right now.
 *
 * This lived inside app/(app)/notifications/page.tsx and could only be read by
 * that page. It is here because two surfaces now ask the same question — the
 * alert page and the bell in the workspace header — and a bell that counts
 * something different from the page it opens is worse than no bell: the reader
 * cannot tell which of the two is lying.
 *
 * TWO SOURCES, DELIBERATELY. Rows the notification worker has actually queued,
 * plus the things currently waiting on this person. The second half matters
 * because GUIDE's notification rules require a reminder to say what it is
 * about — "please submit your report" is called out as the bad example — and
 * the only way to do that is to read the same live state the reminder would
 * have been generated from.
 *
 * Every read goes through asActor, so what comes back is what row-level
 * security already allows this person to see.
 */

export type Alert = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  priority: number;
  createdAt: string | null;
  href?: string;
};

export type AlertFeed = {
  alerts: Alert[];
  /** The week the live half was counted over. Empty when there is no week. */
  cycleLabel: string;
};

export async function alertsFor(actor: string, me: Person): Promise<AlertFeed> {
  const stored = await asActor(
    actor,
    (sql) => sql<{
      id: string;
      kind: string;
      title: string;
      body: string | null;
      priority: number;
      created_at: string;
      action_url: string | null;
    }>`
      select id, kind::text as kind, title, body, priority,
             created_at, action_url
      from notifications
      where status in ('queued', 'sent', 'read')
      order by priority, created_at desc
      limit 20
    `,
  );

  const alerts: Alert[] = stored.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    priority: n.priority,
    createdAt: n.created_at,
    href: n.action_url ?? undefined,
  }));

  /*
   * What is waiting on THIS person, which is a different question per role.
   *
   * HR used to fall into the employee branch and was told every week that
   * "your week has not been reported" — for a check-in they never file. PRD §5
   * makes HR a consumer and the enforcement partner, so what is waiting on
   * them is other people's missing reports, not their own.
   */
  let cycleLabel = "";

  if (me.role === "executive" || me.role === "admin") {
    const week = await latestVisibleCycle(actor);
    if (week) {
      cycleLabel = week.label;
      const brief = await executiveBrief(actor, week.id);
      for (const i of brief.insights.filter((x) => x.severity !== "normal")) {
        alerts.push({
          id: i.id,
          kind: i.type,
          title: i.title,
          body: i.recommendedAction,
          priority: i.severity === "critical" ? 0 : 1,
          createdAt: null,
          href: "/advice",
        });
      }
    }
  } else if (me.role === "hr") {
    /*
     * HR sees both halves: their own week, and everybody else's reporting.
     * They file now, so the personal reminder below applies to them too.
     *
     * The open week, not the settled one: chasing somebody is only useful
     * while they can still act on it.
     */
    const cycles = await recentCycles(actor, 2);
    const week = cycles.at(-1) ?? (await latestVisibleCycle(actor));
    if (week) {
      cycleLabel = week.label;
      const rows = await reportingCompliance(actor, week.id);
      const missing = rows.filter((r) => !r.submitted);
      const late = rows.filter((r) => r.submitted && r.late);

      if (missing.length > 0) {
        alerts.push({
          id: "hr-missing",
          kind: "reminder",
          title: `${missing.length} ${missing.length === 1 ? "person has" : "people have"} not reported`,
          body: `${missing.map((r) => r.full_name).slice(0, 4).join(", ")}${missing.length > 4 ? ` and ${missing.length - 4} others` : ""}. Reminders have already gone out.`,
          priority: 1,
          createdAt: null,
          href: "/compliance",
        });
      }
      if (late.length > 0) {
        alerts.push({
          id: "hr-late",
          kind: "reminder",
          title: `${late.length} filed after the deadline`,
          body: "Late is still reported. Worth knowing, not worth chasing.",
          priority: 2,
          createdAt: null,
          href: "/compliance",
        });
      }

      /*
       * And their OWN week, because HR files one now.
       *
       * Read from the same compliance rows rather than a second query: HR
       * appears in that list like anybody else, which is the whole point of
       * them no longer being exempt.
       */
      const self = rows.find((r) => r.profile_id === me.id);
      if (self && !self.submitted) {
        alerts.push({
          id: "checkin",
          kind: "reminder",
          title: "Your own week has not been reported",
          body: "You chase everybody else on this. It takes about thirty seconds.",
          priority: 1,
          createdAt: null,
          href: "/check-in",
        });
      }
    }
  } else {
    const cycles = await recentCycles(actor);
    const week = cycles.at(-1);
    if (week) {
      cycleLabel = week.label;
      const brief = await weeklyBrief(actor, me.id, week.id, me.full_name, week.label);
      for (const [i, q] of brief.questions.entries()) {
        alerts.push({
          id: `q-${i}`,
          kind: "question",
          title: "One quick question about your week",
          body: q,
          priority: 1,
          createdAt: null,
          href: "/my-week",
        });
      }
      if (!brief.reconciliation?.responded) {
        alerts.push({
          id: "checkin",
          kind: "reminder",
          title: "Your week has not been reported",
          body: "It takes about thirty seconds, and the questions are already filled in from what you committed to.",
          priority: 1,
          createdAt: null,
          href: "/check-in",
        });
      }
    }
  }

  alerts.sort((a, b) => a.priority - b.priority);

  return { alerts, cycleLabel };
}
