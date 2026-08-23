import { asActor, asService } from "./db";
import type { OrgRole } from "./roles";

/*
 * Every read the interface performs, in one place.
 *
 * All of these run through asActor(), so what comes back is already filtered
 * by the policies in migration 0006. There is no "and also check the role in
 * the component" layer, because that layer is exactly where such checks get
 * forgotten.
 */

export type Cycle = {
  id: string;
  label: string;
  starts_on: string;
  ends_on: string;
  seq: number;
};

export type Person = {
  id: string;
  full_name: string;
  email: string;
  title: string | null;
  /*
   * The full role union, from lib/roles.
   *
   * This used to omit "hr" while HR profiles existed in the database, so every
   * `me.role === "hr"` check in the codebase was an impossible comparison the
   * compiler flagged — and the natural fix was to delete the check rather than
   * the type. That is how HR ended up falling through to the employee branch
   * on /notifications and being told each week that their own check-in was
   * missing, for a check-in they never file.
   */
  role: OrgRole;
  department_id: string | null;
  department_name: string | null;
  color: string | null;
};

export async function listPeople(): Promise<Person[]> {
  return asService(
    (sql) => sql<Person>`
      select p.id, p.full_name, p.email, p.title, p.role,
             p.department_id, d.name as department_name, d.color
      from profiles p
      left join departments d on d.id = p.department_id
      join organizations o on o.id = p.org_id
      where o.slug = 'nexus-demo'
      order by
        case p.role when 'executive' then 0 when 'lead' then 1 else 2 end,
        d.name nulls first,
        p.full_name
    `,
  );
}

export async function getPerson(profileId: string): Promise<Person | null> {
  const rows = await asService(
    (sql) => sql<Person>`
      select p.id, p.full_name, p.email, p.title, p.role,
             p.department_id, d.name as department_name, d.color
      from profiles p
      left join departments d on d.id = p.department_id
      where p.id = ${profileId}
    `,
  );
  return rows[0] ?? null;
}

/** The most recent settled week — the one an executive is actually reading. */
export async function recentCycles(actor: string, limit = 8): Promise<Cycle[]> {
  return asActor(actor, async (sql) => {
    const rows = await sql<Cycle>`
      select id, label, starts_on, ends_on, seq
      from cycles
      where kind = 'week' and starts_on < date_trunc('week', current_date)::date
      order by starts_on desc
      limit ${limit}
    `;
    return rows.reverse();
  });
}

// ---------------------------------------------------------------------------
// Executive view
// ---------------------------------------------------------------------------

export type CoursePoint = {
  cycle_id: string;
  label: string;
  seq: number;
  promised: number;
  delivered: number;
  delivery_rate: number | null;
  signal_integrity: number | null;
  unplanned: number;
  silent_drops: number;
  people_reporting: number;
  people_responded: number;
};

/**
 * The eight-week course plot: what the organisation said it would do, against
 * what it did. Everything here is counted in SQL — the model is never asked to
 * produce a figure that an executive might check.
 */
export async function coursePlot(actor: string): Promise<CoursePoint[]> {
  return asActor(actor, async (sql) => {
    const rows = await sql<CoursePoint>`
      select
        cy.id                                  as cycle_id,
        cy.label,
        cy.seq,
        coalesce(sum(r.promised_count), 0)::int   as promised,
        coalesce(sum(r.delivered_count), 0)::int  as delivered,
        round(avg(r.delivery_rate)    filter (where r.delivery_rate is not null), 1)::float8 as delivery_rate,
        round(avg(r.signal_integrity) filter (where r.signal_integrity is not null), 1)::float8 as signal_integrity,
        coalesce(sum(r.unplanned_count), 0)::int  as unplanned,
        coalesce(sum(r.silent_drop_count), 0)::int as silent_drops,
        count(*)::int                             as people_reporting,
        count(*) filter (where r.responded)::int  as people_responded
      from reconciliations r
      join cycles cy on cy.id = r.cycle_id
      where cy.kind = 'week'
      group by cy.id, cy.label, cy.seq, cy.starts_on
      order by cy.starts_on
    `;
    return rows.slice(-8);
  });
}

export type DepartmentHealth = {
  department_id: string;
  department_name: string;
  color: string;
  delivery_rate: number | null;
  signal_integrity: number | null;
  focus_ratio: number | null;
  people_reporting: number;
  people_responded: number;
  silent_drop_count: number;
  carryover_count: number;
  unplanned_count: number;
  protected_count: number;
};

export async function departmentHealth(
  actor: string,
  cycleId: string,
): Promise<DepartmentHealth[]> {
  return asActor(
    actor,
    (sql) => sql<DepartmentHealth>`
      select department_id, department_name, color,
             delivery_rate::float8, signal_integrity::float8, focus_ratio::float8,
             people_reporting::int, people_responded::int,
             silent_drop_count::int, carryover_count::int,
             unplanned_count::int, protected_count::int
      from department_cycle_health
      where cycle_id = ${cycleId}
      order by delivery_rate nulls last
    `,
  );
}

export type BlockingEdge = {
  from_name: string;
  from_color: string;
  to_name: string;
  to_color: string;
  blocked_count: number;
  blocked_weight: number;
  oldest_since: string;
};

/**
 * Who is waiting on whom. This is the view an executive can act on directly —
 * a bottleneck between two teams is one of the very few problems only they can
 * clear.
 */
export async function blockingEdges(
  actor: string,
  cycleId: string,
): Promise<BlockingEdge[]> {
  return asActor(
    actor,
    (sql) => sql<BlockingEdge>`
      select
        f.name as from_name, f.color as from_color,
        t.name as to_name,   t.color as to_color,
        de.blocked_count::int, de.blocked_weight::float, de.oldest_since
      from dependency_edges de
      join departments f on f.id = de.from_department_id
      join departments t on t.id = de.to_department_id
      where de.cycle_id = ${cycleId}
      order by de.blocked_weight desc
    `,
  );
}

export type CarryChain = {
  commitment_id: string;
  title: string;
  full_name: string;
  department_name: string | null;
  color: string | null;
  depth: number;
  status: string;
};

/**
 * Commitments that have been "next week" for several weeks running.
 *
 * This is the finding no weekly-status tool can produce, because each week in
 * isolation looks like a small, forgivable slip. Only the chain reveals that
 * the same promise has been renewed six times.
 */
export async function chronicCarryovers(
  actor: string,
  minDepth = 3,
): Promise<CarryChain[]> {
  return asActor(
    actor,
    (sql) => sql<CarryChain>`
      with recursive chain as (
        select c.id, c.id as root, 1 as depth
        from commitments c
        where c.carried_from_commitment_id is null and c.deleted_at is null
        union all
        select c.id, ch.root, ch.depth + 1
        from commitments c
        join chain ch on c.carried_from_commitment_id = ch.id
        where c.deleted_at is null
      ),
      deepest as (
        select distinct on (root) root, id, depth
        from chain
        order by root, depth desc
      )
      select
        c.id as commitment_id, c.title, c.status::text as status,
        dp.depth::int as depth,
        p.full_name, d.name as department_name, d.color
      from deepest dp
      join commitments c on c.id = dp.id
      join profiles p on p.id = c.profile_id
      left join departments d on d.id = c.department_id
      where dp.depth >= ${minDepth}
      order by dp.depth desc, c.title
      limit 8
    `,
  );
}

export type AttentionRow = {
  profile_id: string;
  full_name: string;
  title: string | null;
  department_name: string | null;
  color: string | null;
  delivery_rate: number | null;
  signal_integrity: number | null;
  silent_drop_count: number;
  protected_count: number;
  promised_count: number;
  responded: boolean;
};

/**
 * People whose week needs a conversation — framed as support, never ranked.
 *
 * Ordered by signal integrity rather than delivery: someone who delivered
 * little but said so early needs help with load, while someone who went quiet
 * needs a different conversation entirely, and only the second is urgent.
 */
export async function needsSupport(
  actor: string,
  cycleId: string,
): Promise<AttentionRow[]> {
  return asActor(
    actor,
    (sql) => sql<AttentionRow>`
      select
        r.profile_id, p.full_name, p.title,
        d.name as department_name, d.color,
        r.delivery_rate::float8, r.signal_integrity::float8,
        r.silent_drop_count::int, r.protected_count::int, r.promised_count::int,
        r.responded
      from reconciliations r
      join profiles p on p.id = r.profile_id
      left join departments d on d.id = p.department_id
      where r.cycle_id = ${cycleId}
        and (r.silent_drop_count > 0 or r.responded = false or r.delivery_rate < 60)
      order by r.silent_drop_count desc, r.signal_integrity nulls first, r.delivery_rate
      limit 6
    `,
  );
}

// ---------------------------------------------------------------------------
// Department drill-down
// ---------------------------------------------------------------------------

export type Department = {
  id: string;
  name: string;
  color: string;
  description: string | null;
  lead_name: string | null;
};

export async function getDepartment(
  actor: string,
  departmentId: string,
): Promise<Department | null> {
  const rows = await asActor(
    actor,
    (sql) => sql<Department>`
      select d.id, d.name, d.color, d.description, l.full_name as lead_name
      from departments d
      left join profiles l on l.id = d.lead_id
      where d.id = ${departmentId}
    `,
  );
  return rows[0] ?? null;
}

export type TeamMember = {
  profile_id: string;
  full_name: string;
  title: string | null;
  delivery_rate: number | null;
  signal_integrity: number | null;
  promised_count: number;
  delivered_count: number;
  silent_drop_count: number;
  protected_count: number;
  unplanned_count: number;
  carryover_count: number;
  responded: boolean;
  status: string | null;
};

/**
 * The team's week, person by person.
 *
 * Left-joined from profiles rather than inner-joined from reconciliations so
 * that somebody who filed nothing still appears, with nulls. A roster that
 * silently omits non-responders is how a lead misses the one person who has
 * gone quiet — the exact case that matters most.
 */
export async function teamWeek(
  actor: string,
  departmentId: string,
  cycleId: string,
): Promise<TeamMember[]> {
  return asActor(
    actor,
    (sql) => sql<TeamMember>`
      select
        p.id as profile_id, p.full_name, p.title,
        r.delivery_rate::float8, r.signal_integrity::float8,
        coalesce(r.promised_count, 0)::int    as promised_count,
        coalesce(r.delivered_count, 0)::int   as delivered_count,
        coalesce(r.silent_drop_count, 0)::int as silent_drop_count,
        coalesce(r.protected_count, 0)::int   as protected_count,
        coalesce(r.unplanned_count, 0)::int   as unplanned_count,
        coalesce(r.carryover_count, 0)::int   as carryover_count,
        coalesce(r.responded, false)          as responded,
        r.status::text                        as status
      from profiles p
      left join reconciliations r
        on r.profile_id = p.id and r.cycle_id = ${cycleId}
      where p.department_id = ${departmentId} and p.is_active
      order by r.delivery_rate nulls first, p.full_name
    `,
  );
}

export type CriticalItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  owner: string;
  profile_id: string;
  blocker_kind: string;
  depends_on_department: string | null;
  depends_on_color: string | null;
  carry_depth: number;
  was_planned: boolean;
};

/**
 * The department's critical path: the work that is high priority, blocked, or
 * has been carried more than once. Ordered so the most stuck, most important
 * item is first.
 */
export async function criticalPath(
  actor: string,
  departmentId: string,
  cycleId: string,
): Promise<CriticalItem[]> {
  return asActor(
    actor,
    (sql) => sql<CriticalItem>`
      with recursive back as (
        select c.id as head, c.carried_from_commitment_id as prev, 1 as depth
        from commitments c
        where c.department_id = ${departmentId} and c.target_cycle_id = ${cycleId}
        union all
        select b.head, c.carried_from_commitment_id, b.depth + 1
        from back b join commitments c on c.id = b.prev
      ),
      depths as (select head, max(depth)::int as depth from back group by head)
      select
        c.id, c.title, c.status::text as status, c.priority::text as priority,
        p.full_name as owner, p.id as profile_id,
        c.blocker_kind::text as blocker_kind,
        d.name as depends_on_department, d.color as depends_on_color,
        coalesce(dp.depth, 1) as carry_depth,
        c.was_planned
      from commitments c
      join profiles p on p.id = c.profile_id
      left join departments d on d.id = c.depends_on_department_id
      left join depths dp on dp.head = c.id
      where c.department_id = ${departmentId}
        and c.target_cycle_id = ${cycleId}
        and c.deleted_at is null
        and (c.priority in ('critical', 'high')
             or c.status = 'blocked'
             or coalesce(dp.depth, 1) > 1)
      order by
        case c.status when 'blocked' then 0 else 1 end,
        coalesce(dp.depth, 1) desc,
        priority_weight(c.priority) desc
      limit 12
    `,
  );
}

// ---------------------------------------------------------------------------
// Person view
// ---------------------------------------------------------------------------

export type Reconciliation = {
  id: string;
  cycle_id: string;
  label: string;
  status: string;
  promised_count: number;
  delivered_count: number;
  partial_count: number;
  deferred_count: number;
  blocked_count: number;
  dropped_count: number;
  silent_drop_count: number;
  carryover_count: number;
  unplanned_count: number;
  protected_count: number;
  delivery_rate: number | null;
  signal_integrity: number | null;
  focus_ratio: number | null;
  responded: boolean;
  ai_narrative: string | null;
  /** Cached coaching, written once by weeklyBrief. Shape: {title, body, based_on}[]. */
  ai_coaching: { title: string; body: string; based_on: string }[] | null;
  employee_note: string | null;
};

export async function reconciliationFor(
  actor: string,
  profileId: string,
  cycleId: string,
): Promise<Reconciliation | null> {
  const rows = await asActor(
    actor,
    (sql) => sql<Reconciliation>`
      select r.id, r.cycle_id, cy.label, r.status::text as status,
             r.promised_count, r.delivered_count, r.partial_count,
             r.deferred_count, r.blocked_count, r.dropped_count,
             r.silent_drop_count, r.carryover_count, r.unplanned_count,
             r.protected_count,
             r.delivery_rate::float8, r.signal_integrity::float8, r.focus_ratio::float8,
             r.responded, r.ai_narrative, r.ai_coaching, r.employee_note
      from reconciliations r
      join cycles cy on cy.id = r.cycle_id
      where r.profile_id = ${profileId} and r.cycle_id = ${cycleId}
    `,
  );
  return rows[0] ?? null;
}

export type CommitmentRow = {
  id: string;
  title: string;
  category: string | null;
  priority: string;
  status: string;
  was_planned: boolean;
  deviation_declared: boolean;
  blocker_kind: string;
  depends_on_department: string | null;
  carry_depth: number;
  source_quote: string | null;
  estimated_effort_hours: number | null;
  actual_effort_hours: number | null;
};

export type ReportingStreak = {
  /** Delivery rate of the most recent SETTLED week, or null if none has settled. */
  delivery_rate: number | null;
  /** Consecutive weeks reported, counting back from the most recent. */
  streak_weeks: number;
};

/**
 * How this person has been doing, for the reconciliation sidebar.
 *
 * Both figures are counted here rather than derived in the browser, for the
 * same reason as everything else on screen: a number an employee can check has
 * to come from a row. The streak is deliberately "weeks reported", not "weeks
 * delivered" — rewarding the reporting rhythm is the behaviour this product
 * wants, and rewarding delivery would quietly punish somebody who had a hard
 * week and said so.
 */
export async function reportingStreak(
  actor: string,
  profileId: string,
): Promise<ReportingStreak> {
  const rows = await asActor(
    actor,
    (sql) => sql<{ responded: boolean; delivery_rate: number | null; status: string }>`
      select r.responded,
             r.delivery_rate::float8,
             r.status::text as status
      from reconciliations r
      join cycles cy on cy.id = r.cycle_id
      where r.profile_id = ${profileId}
      order by cy.starts_on desc
      limit 26
    `,
  );

  const settled = rows.find(
    (r) => r.delivery_rate !== null && ["confirmed", "auto_confirmed"].includes(r.status),
  );

  // Count back from the most recent week until a week they did not report.
  let streak = 0;
  for (const r of rows) {
    if (!r.responded) break;
    streak += 1;
  }

  return {
    delivery_rate: settled?.delivery_rate === null || settled === undefined
      ? null
      : Math.round(settled.delivery_rate),
    streak_weeks: streak,
  };
}

/** The rows the Reconciliation Ribbon is drawn from. */
export async function commitmentsFor(
  actor: string,
  profileId: string,
  cycleId: string,
): Promise<CommitmentRow[]> {
  return asActor(
    actor,
    (sql) => sql<CommitmentRow>`
      with recursive back as (
        select c.id as head, c.carried_from_commitment_id as prev, 1 as depth
        from commitments c
        where c.profile_id = ${profileId} and c.target_cycle_id = ${cycleId}
        union all
        select b.head, c.carried_from_commitment_id, b.depth + 1
        from back b
        join commitments c on c.id = b.prev
      ),
      depths as (
        select head, max(depth)::int as depth from back group by head
      )
      select
        c.id, c.title, c.category, c.priority::text as priority,
        c.status::text as status, c.was_planned, c.deviation_declared,
        c.blocker_kind::text as blocker_kind,
        d.name as depends_on_department,
        coalesce(dp.depth, 1) as carry_depth,
        c.source_quote,
        c.estimated_effort_hours::float8, c.actual_effort_hours::float8
      from commitments c
      left join departments d on d.id = c.depends_on_department_id
      left join depths dp on dp.head = c.id
      where c.profile_id = ${profileId}
        and c.target_cycle_id = ${cycleId}
        and c.deleted_at is null
      order by c.was_planned desc, priority_weight(c.priority) desc, c.title
    `,
  );
}

export type PersonTrend = {
  cycle_id: string;
  label: string;
  delivery_rate: number | null;
  signal_integrity: number | null;
  promised_count: number;
};

export async function personTrend(
  actor: string,
  profileId: string,
): Promise<PersonTrend[]> {
  return asActor(
    actor,
    (sql) => sql<PersonTrend>`
      select r.cycle_id, cy.label, r.delivery_rate::float8, r.signal_integrity::float8,
             r.promised_count::int
      from reconciliations r
      join cycles cy on cy.id = r.cycle_id
      where r.profile_id = ${profileId}
      order by cy.starts_on
    `,
  );
}

// ---------------------------------------------------------------------------
// Review-window awareness
// ---------------------------------------------------------------------------

export type StaffUpdate = {
  profile_id: string;
  full_name: string;
  department_name: string | null;
  department_color: string | null;
  status: string;
  title: string;
  /** Their own words for it, when the extractor found a literal sentence. */
  source_quote: string | null;
  at: string;
};

/**
 * Who moved what, most recently.
 *
 * Read from COMMITMENTS, deliberately, and this is a security decision rather
 * than a convenience one. The obvious source for "recent staff updates" is
 * check_ins.raw_text — but RLS policy `check_ins_own` restricts those to their
 * author, and migration 0006 says why in one line: "The *plan* is shared; the
 * raw words behind it are not."
 *
 * A commitment is the part the person published. It carries their own
 * source_quote, so the interface still shows a human sentence rather than a
 * row of statuses, and an executive reading this screen sees exactly what the
 * employee chose to put on the record. Sourcing it from raw check-in text
 * would have shown the same words while quietly making everyone's private
 * draft readable by leadership.
 */
export async function recentStaffUpdates(
  actor: string,
  cycleId: string,
  limit = 6,
): Promise<StaffUpdate[]> {
  return asActor(
    actor,
    (sql) => sql<StaffUpdate>`
      /*
       * One row per PERSON, not per commitment.
       *
       * Ordering commitments by recency alone returns whatever the last
       * batch touched — which on seeded data was the same person three
       * times, twice with identical text. A feed that shows one name
       * repeatedly tells an executive nothing about the organisation, and
       * looks broken even when it is not.
       */
      select * from (
        select distinct on (c.profile_id)
               c.profile_id,
               p.full_name,
               d.name  as department_name,
               d.color as department_color,
               c.status::text as status,
               c.title,
               c.source_quote,
               greatest(c.updated_at, c.created_at) as at
        from commitments c
        join profiles p on p.id = c.profile_id
        left join departments d on d.id = c.department_id
        where c.deleted_at is null
          and p.status = 'active'
          and (c.target_cycle_id = ${cycleId} or c.created_cycle_id = ${cycleId})
        order by c.profile_id, greatest(c.updated_at, c.created_at) desc
      ) latest
      order by at desc
      limit ${limit}
    `,
  );
}

/**
 * The most recent cycle this actor can actually see reconciliations for.
 *
 * Not always the most recent week. "The employee sees it first" means the
 * newest week is normally still inside its correction window and invisible to
 * anyone above — so landing the Chairman on it would show him an empty page
 * and make the product look broken, when in fact it is working.
 */
/*
 * The latest week this person may read as final.
 *
 * SETTLED, not merely present. This used to accept a week the moment any
 * reconciliation existed for it — including the reader's OWN row while it was
 * still inside the correction window, which only they can see. A lead
 * therefore landed on an unsettled week and saw their team as "1 of 5
 * reported" while the Chairman was reading the previous, complete one: two
 * people looking at different weeks with nothing on screen to say so.
 *
 * Confirmed or auto-confirmed is the same rule runDigest uses to choose a week
 * to brief on, and the dashboard must never disagree with the briefing built
 * from it.
 */
export async function latestVisibleCycle(actor: string): Promise<Cycle | null> {
  const rows = await asActor(
    actor,
    (sql) => sql<Cycle>`
      select cy.id, cy.label, cy.starts_on, cy.ends_on, cy.seq
      from cycles cy
      where cy.kind = 'week'
        and exists (
          select 1 from reconciliations r
          where r.cycle_id = cy.id
            and r.status in ('confirmed', 'auto_confirmed')
        )
      order by cy.starts_on desc
      limit 1
    `,
  );
  return rows[0] ?? null;
}

export type PendingReview = {
  cycle_id: string;
  label: string;
  pending: number;
};

/**
 * How many people are still confirming a week that has not opened up yet.
 *
 * Deliberately runs as the service role, and deliberately returns ONLY a
 * count. The Chairman needs to know the week is not final — otherwise the
 * dashboard silently understates the organisation — but he must not learn who
 * has not confirmed, because that is exactly the pressure the review window
 * exists to remove. A number is oversight; a list would be a leaderboard of
 * people who have not replied yet.
 */
export async function pendingReview(afterCycleSeq: number): Promise<PendingReview | null> {
  const rows = await asService(
    (sql) => sql<PendingReview>`
      select r.cycle_id, cy.label, count(*)::int as pending
      from reconciliations r
      join cycles cy on cy.id = r.cycle_id
      join organizations o on o.id = r.org_id
      where o.slug = 'nexus-demo'
        and r.status = 'awaiting_employee'
        and cy.seq > ${afterCycleSeq}
      group by r.cycle_id, cy.label, cy.starts_on
      order by cy.starts_on desc
      limit 1
    `,
  );
  return rows[0] ?? null;
}
