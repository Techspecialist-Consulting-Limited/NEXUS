import { asService, type Sql } from "../db";
import { aiProvider } from "./provider";
import type { ToneContext } from "./types";

/*
 * The coordination layer: what should happen after a report, a missed update,
 * a blocker, or a risk.
 *
 * THE DIVISION OF LABOUR HERE IS THE WHOLE DESIGN.
 *
 *   Deterministic (this file, SQL)   WHO is told, and WHETHER it escalates.
 *   The model (tone())               HOW it reads.
 *   enqueue_notification (0005)      HOW MUCH anyone receives.
 *
 * The brief asks the AI to decide "what should be sent, held, escalated, or
 * suppressed". It decides the wording and the ask, which is genuinely its job.
 * It does not decide volume, because the daily budget, quiet hours and
 * suppression log are deterministic, tested, and the only reason a proactive
 * assistant does not become a spam machine. A model that could also choose how
 * often to speak would make that guarantee unpredictable and unauditable.
 *
 * Escalation is deterministic for a second reason. GUIDE AI rule 9: ask before
 * escalating. Somebody who went quiet is asked first, and only reaches their
 * lead after the review window has elapsed with no answer. That ordering is a
 * promise to the people being reported on, and a promise is not a thing to
 * leave to a model's judgement on the day.
 */

export type Dispatch = {
  recipientProfileId: string;
  recipientName: string;
  recipientRole: string;
  kind: string;
  priority: 0 | 1 | 2 | 3;
  actionUrl: string;
  actionLabel: string;
  /** Final figures. The model words around these and may not alter them. */
  facts: Record<string, unknown>;
  /** Ask rather than conclude. */
  sensitive: boolean;
  /** Why this was chosen, recorded so the decision can be reviewed later. */
  rationale: string;
};

/**
 * Work out what the organisation should be told, for one cycle.
 *
 * Reads as the service role: this runs as a job on behalf of nobody, and needs
 * to see across people to notice that one unit is blocking another. Nothing it
 * returns is delivered here — planning and sending are separate so the plan
 * can be inspected without anything leaving the building.
 */
export type Run = <T>(fn: (sql: Sql) => Promise<T>) => Promise<T>;

export async function planDispatches(
  cycleId: string,
  /*
   * Injectable so the escalation rules can be tested against a throwaway
   * database. These rules are promises to the people being reported on — the
   * person hears first, a blocker goes to whoever can clear it — and a promise
   * that is never tested is a promise that quietly stops being true.
   */
  run: Run = asService,
): Promise<Dispatch[]> {
  const plans: Dispatch[] = [];

  // ---- 1. commitments that went quiet -----------------------------------
  //
  // The person hears about this first, always, and it is phrased as a
  // question. Nobody above them sees an interpretation until they have had
  // the chance to answer.
  const silent = await run(
    (sql) => sql<{
      profile_id: string;
      full_name: string;
      role: string;
      title: string;
      commitment_id: string;
    }>`
      select p.id as profile_id, p.full_name, p.role::text as role,
             c.title, c.id as commitment_id
      from commitments c
      join profiles p on p.id = c.profile_id
      where c.target_cycle_id = ${cycleId}
        and c.deleted_at is null
        and c.status in ('dropped', 'deferred')
        and c.deviation_declared = false
      order by p.full_name
      limit 40
    `,
  );

  for (const row of silent) {
    plans.push({
      recipientProfileId: row.profile_id,
      recipientName: row.full_name,
      recipientRole: row.role,
      kind: "silent_drop",
      priority: 1,
      actionUrl: "/my-week",
      actionLabel: "Answer",
      /*
       * The id, not just the title. Titles repeat across people — two
       * engineers can both be "rebuilding the drill-down view" — so a
       * notification identified only by title cannot be traced back to the
       * commitment it is actually about.
       */
      facts: { title: row.title, commitmentId: row.commitment_id },
      sensitive: true,
      rationale:
        "Ended the cycle unresolved and undeclared. Asked of the person " +
        "before it is visible to anyone above them.",
    });
  }

  // ---- 2. still open, never resolved ------------------------------------
  const open = await run(
    (sql) => sql<{
      profile_id: string;
      full_name: string;
      role: string;
      title: string;
      commitment_id: string;
    }>`
      select p.id as profile_id, p.full_name, p.role::text as role,
             c.title, c.id as commitment_id
      from commitments c
      join profiles p on p.id = c.profile_id
      where c.target_cycle_id = ${cycleId}
        and c.deleted_at is null
        and c.status in ('promised', 'in_progress')
      order by p.full_name
      limit 40
    `,
  );

  for (const row of open) {
    plans.push({
      recipientProfileId: row.profile_id,
      recipientName: row.full_name,
      recipientRole: row.role,
      kind: "commitment_mismatch",
      priority: 1,
      actionUrl: "/my-week",
      actionLabel: "Resolve it",
      facts: { title: row.title, commitmentId: row.commitment_id, age: "this cycle" },
      sensitive: false,
      rationale: "Open at the end of the cycle with no stated outcome.",
    });
  }

  // ---- 3. one unit blocking another --------------------------------------
  //
  // Aimed at the lead who can clear it, not at the people waiting. They have
  // done nothing wrong and are already protected in the scoring.
  const blocking = await run(
    (sql) => sql<{
      lead_id: string;
      lead_name: string;
      lead_role: string;
      owning_unit: string;
      blocked_unit: string;
      count: number;
    }>`
      select
        lead.id as lead_id, lead.full_name as lead_name, lead.role::text as lead_role,
        owner.name as owning_unit, blocked.name as blocked_unit,
        count(*)::int as count
      from commitments c
      join departments blocked on blocked.id = c.department_id
      join departments owner on owner.id = c.depends_on_department_id
      join profiles lead on lead.id = owner.lead_id
      where c.target_cycle_id = ${cycleId}
        and c.status = 'blocked'
        and c.depends_on_department_id is not null
        and c.deleted_at is null
      group by lead.id, lead.full_name, lead.role, owner.name, blocked.name
      order by count desc
      limit 10
    `,
  );

  for (const row of blocking) {
    plans.push({
      recipientProfileId: row.lead_id,
      recipientName: row.lead_name,
      recipientRole: row.lead_role,
      kind: "blocker_owner",
      priority: row.count >= 3 ? 0 : 1,
      actionUrl: "/dashboard",
      actionLabel: "See the unit",
      facts: {
        owningUnit: row.owning_unit,
        blockedUnit: row.blocked_unit,
        count: row.count,
      },
      sensitive: false,
      rationale:
        `${row.count} commitments in ${row.blocked_unit} cannot move until ` +
        `${row.owning_unit} clears them. Only a lead can.`,
    });
  }

  // ---- 4. nobody heard from ---------------------------------------------
  //
  // A reminder to the person. Deliberately NOT to their lead: a missing
  // update is a missing signal, not a missing person, and escalating on the
  // first silence is how a reporting tool becomes a surveillance tool.
  const quiet = await run(
    (sql) => sql<{
      profile_id: string;
      full_name: string;
      role: string;
      reminders_sent: number;
      longest_open: string | null;
    }>`
      select p.id as profile_id, p.full_name, p.role::text as role,
             /*
              * How many times we have already asked, this cycle.
              *
              * A third reminder worded exactly like the first is how people
              * learn to ignore all of them. Notifications carry no per-subject
              * key, so this counts by kind within the cycle window — which is
              * exactly the question being asked: how often have we chased this
              * person about this week.
              */
             (select count(*)
                from notifications n
               where n.profile_id = p.id
                 and n.kind = 'checkin_reminder'
                 and n.created_at >= cy.starts_on::timestamptz)::int
               as reminders_sent,

             /*
              * The thing worth naming. A reminder that names the commitment
              * gets answered; "please submit your report" does not.
              */
             oldest.title as longest_open
      from profiles p
      cross join (select starts_on from cycles where id = ${cycleId}) cy
      left join check_ins ci
        on ci.profile_id = p.id and ci.cycle_id = ${cycleId}
      left join lateral (
        select c.title
        from commitments c
        where c.profile_id = p.id
          and c.target_cycle_id = ${cycleId}
          and c.deleted_at is null
          and c.status in ('promised', 'in_progress', 'blocked', 'partial')
        order by priority_weight(c.priority) desc, c.created_at
        limit 1
      ) oldest on true
      where p.status = 'active'
        -- Everybody but the Chairman files a check-in, so everybody but the
        -- Chairman is chased. Written as an exclusion rather than a list:
        -- first HR and then the Administrator were left off the list while
        -- runPrompt happily opened a check-in for them, so the reminder never
        -- followed the thing being asked for.
        and p.role <> 'executive'
        and (ci.id is null or ci.responded_at is null)
      order by p.full_name
      limit 40
    `,
  );

  for (const row of quiet) {
    plans.push({
      recipientProfileId: row.profile_id,
      recipientName: row.full_name,
      recipientRole: row.role,
      kind: "checkin_reminder",
      priority: 2,
      actionUrl: "/check-in",
      actionLabel: "Check in",
      /*
       * Enough for the wording to evolve. A first ask and a third ask are
       * different messages, and naming what is outstanding turns a chore into
       * a question somebody can answer in one tap.
       */
      facts: {
        reminders_already_sent: row.reminders_sent,
        ...(row.longest_open ? { longest_open_commitment: row.longest_open } : {}),
      },
      sensitive: false,
      rationale:
        row.reminders_sent === 0
          ? "No check-in recorded for this cycle."
          : `No check-in recorded; ${row.reminders_sent} reminder(s) already sent this cycle.`,
    });
  }

  /*
   * Order by urgency before the budget is applied.
   *
   * enqueue_notification takes the first N of the day and suppresses the
   * rest, so whatever arrives first wins. Sorting here means the thing that
   * matters most is what survives the cap, rather than whichever query
   * happened to run first.
   */
  return plans.sort((a, b) => a.priority - b.priority);
}

export type WordedDispatch = Dispatch & {
  title: string;
  body: string;
  ask?: string;
};

/** Put the words on a plan, using whichever provider is configured. */
export async function wordDispatches(
  plans: Dispatch[],
): Promise<WordedDispatch[]> {
  const provider = aiProvider();

  return Promise.all(
    plans.map(async (plan) => {
      const context: ToneContext = {
        recipientRole: plan.recipientRole,
        recipientName: plan.recipientName,
        kind: plan.kind,
        priority: plan.priority,
        facts: plan.facts,
        sensitive: plan.sensitive,
      };

      try {
        const { data } = await provider.tone(context);
        return { ...plan, ...data };
      } catch {
        /*
         * A model failure must not lose the notification. The mock's wording
         * is the floor the product falls back to, and it is written to be
         * good enough to send.
         */
        const { MockProvider } = await import("./mock");
        const { data } = await new MockProvider().tone(context);
        return { ...plan, ...data };
      }
    }),
  );
}

/**
 * Hand the worded plans to the notification budget.
 *
 * Every one goes through enqueue_notification rather than a direct insert, so
 * the daily cap, quiet hours and opt-outs apply exactly as they do everywhere
 * else — and anything held is recorded with its reason rather than vanishing.
 */
export async function deliverDispatches(
  plans: WordedDispatch[],
  run: Run = asService,
): Promise<{ queued: number; suppressed: number }> {
  if (plans.length === 0) return { queued: 0, suppressed: 0 };

  /*
   * Collect the ids this call created and count only those.
   *
   * Counting "notifications from the last minute" instead reports every other
   * job's work as your own — the reminder pass claimed to have reminded 45
   * people out of 15, because the prompt pass had just run. A scheduler log
   * that overstates by 3x is worse than no log: it is the number somebody
   * quotes when asked how noisy the system is.
   */
  const ids: string[] = [];

  await run(async (sql) => {
    for (const p of plans) {
      const body = p.ask ? `${p.body} ${p.ask}` : p.body;
      const rows = await sql<{ enqueue_notification: string | null }>`
        select enqueue_notification(
          ${p.recipientProfileId}::uuid,
          ${p.kind},
          ${p.title},
          ${body},
          ${p.priority}::smallint,
          ${p.actionUrl},
          ${p.actionLabel}
        )
      `;
      const id = rows[0]?.enqueue_notification;
      if (id) ids.push(id);
    }
  });

  if (ids.length === 0) return { queued: 0, suppressed: 0 };

  const [counts] = await run(
    (sql) => sql<{ queued: number; suppressed: number }>`
      select
        count(*) filter (where status = 'queued')::int     as queued,
        count(*) filter (where status = 'suppressed')::int as suppressed
      from notifications
      where id = any(${ids}::uuid[])
    `,
  );

  return counts ?? { queued: 0, suppressed: 0 };
}
