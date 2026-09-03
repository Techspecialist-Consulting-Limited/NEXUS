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

/**
 * The week we are actually in, for this person's organisation.
 *
 * WHY `recentCycles` COULD NOT ANSWER THIS. It excludes the current week on
 * purpose — `starts_on < date_trunc('week', current_date)` — because it exists
 * for the executive view, where the interesting week is the most recent SETTLED
 * one. Correct there, and wrong as a fallback anywhere a person is looking at
 * their own week: on Friday 28 August it answered "17–23 August", a week that
 * had ended five days earlier.
 *
 * Which week it is, is a calendar fact. It does not depend on whether the
 * rhythm has opened a check-in, whether anybody has reported, or whether the
 * week has settled — and a page that reports a different one is wrong in the
 * way people notice first.
 *
 * Null only when the organisation has no cycle covering today, which means the
 * calendar has run out and is worth falling back from rather than inventing.
 */
export async function currentCycle(actor: string): Promise<Cycle | null> {
  const rows = await asActor(
    actor,
    (sql) => sql<Cycle>`
      select cy.id, cy.label, cy.starts_on, cy.ends_on, cy.seq
      from cycles cy
      where cy.kind = 'week'
        and cy.org_id = (select org_id from profiles where id = ${actor})
        and cy.starts_on <= current_date
        and cy.ends_on   >= current_date
      limit 1
    `,
  );
  return rows[0] ?? null;
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

export type UnitMember = {
  id: string;
  full_name: string;
  role: string;
  title: string | null;
};

export type Unit = {
  department_id: string;
  name: string;
  color: string;
  lead_name: string | null;
  members: UnitMember[];
};

export type UnitRoster = {
  units: Unit[];
  /** People in the organisation who are in no unit at all. */
  unassigned: UnitMember[];
};

/**
 * The organisation's shape: every unit, and who is in it.
 *
 * NO CYCLE. `departmentHealth` is the other question — how each unit is
 * doing — and it can only be answered for a week that has settled. So on a
 * new organisation the Units page said "No settled weeks yet" and showed
 * nothing at all: the Chairman could not see the units he had just created,
 * or that nobody had been put in them.
 *
 * Whether a unit is reporting and whether a unit exists are different facts,
 * and the second one is true from the moment it is created.
 *
 * Archived units are excluded; inactive people are not counted. Read through
 * asActor, so this returns exactly what row-level security already allows.
 */
export async function unitRoster(actor: string): Promise<UnitRoster> {
  const [units, unassigned] = await Promise.all([
    asActor(
      actor,
      (sql) => sql<Unit>`
        select d.id as department_id,
               d.name,
               d.color,
               lead.full_name as lead_name,
               coalesce(
                 jsonb_agg(
                   jsonb_build_object(
                     'id', p.id,
                     'full_name', p.full_name,
                     'role', p.role::text,
                     'title', p.title
                   )
                   order by p.full_name
                 ) filter (where p.id is not null),
                 '[]'::jsonb
               ) as members
        from departments d
        left join profiles lead on lead.id = d.lead_id
        left join profiles p
               on p.department_id = d.id
              and p.status = 'active'
              /*
               * THE CHAIRMAN IS NOT A MEMBER OF ANYTHING.
               *
               * This roster answers "who reports, and into which unit". The
               * executive files no weekly update at all — see
               * hasPersonalWorkspace in lib/capabilities.ts, which is the
               * same rule /my-week uses to redirect him away. Counting him
               * as a unit member would put somebody in a unit's headcount
               * who can never appear in its delivery figures.
               */
              and p.role <> 'executive'
        where d.org_id = (select org_id from profiles where id = ${actor})
          and d.archived_at is null
        group by d.id, d.name, d.color, lead.full_name
        order by d.name
      `,
    ),
    asActor(
      actor,
      (sql) => sql<UnitMember>`
        select p.id, p.full_name, p.role::text as role, p.title
        from profiles p
        where p.org_id = (select org_id from profiles where id = ${actor})
          and p.status = 'active'
          and p.department_id is null
          /*
           * AND NOT THE CHAIRMAN.
           *
           * He has no unit by design, so without this the Chairman's own
           * dashboard flagged him in an amber card reading "1 person is in
           * no unit — what they report reaches no unit's delivery figures
           * … put them in a unit". Every clause of that is false about
           * him: he reports nothing, so nothing of his is missing from a
           * figure, and there is no unit he should be put in.
           *
           * The list means "people who report and have nowhere for it to
           * count". That is exactly hasPersonalWorkspace in
           * lib/capabilities.ts, expressed in the one place SQL can say it.
           */
          and p.role <> 'executive'
        order by p.full_name
      `,
    ),
  ]);

  return { units, unassigned };
}

export type WeekCommitment = {
  full_name: string;
  unit: string | null;
  status: string;
  title: string;
  source_quote: string | null;
  was_planned: boolean;
  depends_on: string | null;
};

/**
 * Everything the organisation committed to in one week, per person.
 *
 * NOT `recentStaffUpdates`, which is `distinct on (profile_id)` — one row per
 * person, newest first. That is the right shape for a feed card and the wrong
 * one for the assistant: somebody who filed three things had two of them
 * invisible, so a question like "who asked me for something?" could be
 * answered wrongly from an incomplete set rather than answered honestly from
 * a complete one.
 *
 * Ordered blocked-first so the cap, when a large organisation reaches it,
 * drops the least consequential rows rather than an arbitrary tail.
 *
 * `source_quote` is the extractor's captured sentence, not a paraphrase — it
 * is what lets an answer quote somebody back to themselves. The raw check-in
 * text is deliberately NOT here and is not reachable through any read the
 * Chairman has: policy `check_ins_own` keeps it to its author, and
 * submission_status exists precisely so compliance can see that a report
 * arrived without seeing what it said.
 */
export async function orgWeekCommitments(
  actor: string,
  cycleId: string,
  limit = 60,
): Promise<WeekCommitment[]> {
  return asActor(
    actor,
    (sql) => sql<WeekCommitment>`
      select p.full_name,
             d.name  as unit,
             c.status::text as status,
             c.title,
             c.source_quote,
             c.was_planned,
             dep.name as depends_on
      from commitments c
      join profiles p on p.id = c.profile_id
      left join departments d on d.id = p.department_id
      left join departments dep on dep.id = c.depends_on_department_id
      where c.deleted_at is null
        and p.status = 'active'
        and (c.target_cycle_id = ${cycleId} or c.created_cycle_id = ${cycleId})
      order by (c.status = 'blocked') desc,
               p.full_name,
               c.title
      limit ${limit}
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

/**
 * The most recent coaching already written for this person.
 *
 * READ-ONLY, and deliberately so. `weeklyBrief` will call a model when the
 * cache is cold; this is rendered by the app shell on EVERY page, and a
 * sidebar is not a good enough reason to spend 20-30 seconds and a model call.
 * If nothing has been written yet the sidebar simply has nothing to say, which
 * is a true statement and the one the card makes.
 *
 * Newest settled week first. ai_coaching is written by weeklyBrief and
 * survives refresh_reconciliation() by design (migration 0004).
 */
export async function latestCoaching(
  actor: string,
  profileId: string,
): Promise<{ title: string; body: string; based_on: string }[]> {
  const rows = await asActor(
    actor,
    (sql) => sql<{ ai_coaching: { title: string; body: string; based_on: string }[] | null }>`
      select r.ai_coaching
      from reconciliations r
      join cycles cy on cy.id = r.cycle_id
      where r.profile_id = ${profileId}
        -- typeof before length: jsonb_array_length raises on a non-array, and
        -- this query runs inside the app shell, where a raise is every page.
        and jsonb_typeof(r.ai_coaching) = 'array'
        and jsonb_array_length(r.ai_coaching) > 0
      order by cy.starts_on desc
      limit 1
    `,
  );
  const found = rows[0]?.ai_coaching;
  return Array.isArray(found) ? found : [];
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
  /*
   * THE FIELDS AN EXPANDED CARD SHOWS, and every one of them is a column.
   *
   * My Week and Tasks both open a detail view now — a summary you press to
   * see the whole thing — and a detail view is only worth opening if it holds
   * something the summary did not. These are what `commitments` actually
   * stores about a piece of work beyond its title and status.
   *
   * Nothing here is derived, estimated or inferred. There is no percentage,
   * no progress figure and no "last activity" beyond the timestamps the
   * application itself writes, because the schema holds none of those and a
   * browser is not allowed to invent them — rejected-patterns.md #11.
   */
  /** The longer form of the commitment, when extraction produced one. */
  description: string | null;
  /** Why it ended the way it did — and where a saved status comment lands. */
  outcome_reason: string | null;
  due_on: string | null;
  created_at: string;
  /** When it was declared changed, which is not the same as when it moved. */
  declared_at: string | null;
  delivered_at: string | null;
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
        c.estimated_effort_hours::float8, c.actual_effort_hours::float8,
        c.description, c.outcome_reason, c.due_on,
        c.created_at, c.declared_at, c.delivered_at
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

/** A live commitment, carrying the week it was promised for. */
export type LiveCommitment = CommitmentRow & {
  target_cycle_id: string;
  /** The week this was promised for — "W35 · 24 Aug–30 Aug". */
  target_label: string;
  /** True when that week is the one currently running. */
  is_current_week: boolean;
  /**
   * How many weeks this same promise has been open.
   *
   * Counted from the rows rather than read from `carried_from_commitment_id`,
   * which nothing in the application has ever written — see the note below.
   */
  carry_weeks: number;
  /**
   * The Monday of the week this was promised for.
   *
   * For ordering open work by how long it has actually been outstanding.
   * `carry_weeks` counts how many times the same promise was RE-made, which
   * is a different thing: something promised once in July and never
   * mentioned again has a carry of 1 and is nine weeks old, and the Tasks
   * board was ranking it below work promised last Monday.
   */
  starts_on: string;
};

/**
 * What somebody is actually working on right now.
 *
 * WHY THIS EXISTS, AND WHY `commitmentsFor` COULD NOT DO IT.
 *
 * `commitmentsFor` answers "what was promised FOR this week", filtering
 * `target_cycle_id = $cycle`. That is the right question for a weekly
 * reconciliation and the wrong one for a card headed "what you're working on",
 * because the two-cycle model puts the answer in a different week from the one
 * being displayed: a check-in filed IN W34 produces commitments TARGETING W35,
 * and /my-week shows the week the person was asked to report on.
 *
 * The result was a card that could only ever be empty for the person who had
 * just filed. Abbas Taofeeq reported three commitments and his own page said
 * "Nothing here yet" — the work existed, was correctly stored, and was being
 * asked for by target week against the week before it.
 *
 * ONE ROW PER PIECE OF WORK, COLLAPSED BY TITLE.
 *
 * A promise renewed each week is a NEW commitment row each week. Listing them
 * all showed Chidi Nwosu twelve open items that were three pieces of work
 * repeated across nine weeks — the same two titles from W26 to W34. A list
 * that says "12 open" about three jobs is worse than an empty one, because it
 * is confidently wrong.
 *
 * The obvious key would be `carried_from_commitment_id`, and it cannot be used:
 * NOTHING IN THE APPLICATION EVER SETS IT. Only `supabase/seed/seed.sql:835`
 * writes that column, so on any real database it is null everywhere, every
 * chain is length one, and `chronicCarryovers` — the finding this product
 * treats as its flagship — can never return a row. That is a real gap and it
 * is not this function's to close; this one has to work on the data as it is.
 *
 * So the identity is (person, lower(trim(title))), which is exactly the rule
 * migration 0020 already enforces for a single week. The newest week wins and
 * the number of weeks it has been open is counted and carried, which restores
 * the "this keeps moving" signal from the rows themselves.
 */
export async function liveCommitments(
  actor: string,
  profileId: string,
  limit = 12,
): Promise<LiveCommitment[]> {
  return asActor(
    actor,
    (sql) => sql<LiveCommitment>`
      select
        t.id, t.title, t.category, t.priority, t.status, t.was_planned,
        t.deviation_declared, t.blocker_kind, t.depends_on_department,
        t.carry_depth, t.source_quote,
        t.estimated_effort_hours, t.actual_effort_hours,
        t.description, t.outcome_reason, t.due_on,
        t.created_at, t.declared_at, t.delivered_at,
        t.target_cycle_id, t.target_label, t.is_current_week, t.carry_weeks,
        t.starts_on
      from (
        select distinct on (lower(btrim(c.title)))
          c.id, c.title, c.category, c.priority::text as priority,
          c.status::text as status, c.was_planned, c.deviation_declared,
          c.blocker_kind::text as blocker_kind,
          d.name as depends_on_department,
          c.source_quote,
          c.estimated_effort_hours::float8, c.actual_effort_hours::float8,
          c.description, c.outcome_reason, c.due_on,
          c.created_at, c.declared_at, c.delivered_at,
          c.target_cycle_id,
          cy.label as target_label,
          cy.starts_on,
          -- Ranked in here, where priority is still the enum the function
          -- takes. The outer query only ever sees the ::text form.
          priority_weight(c.priority) as prio,
          (cy.starts_on <= current_date and cy.ends_on >= current_date) as is_current_week,
          /*
           * How many weeks this promise has been open, counted over the same
           * partition the DISTINCT ON collapses. Doubles as carry_depth so the
           * shared CommitmentRow shape keeps meaning what it says.
           */
          count(*) over (partition by lower(btrim(c.title)))::int as carry_weeks,
          count(*) over (partition by lower(btrim(c.title)))::int as carry_depth
        from commitments c
        join cycles cy on cy.id = c.target_cycle_id
        left join departments d on d.id = c.depends_on_department_id
        where c.profile_id = ${profileId}
          and c.deleted_at is null
          /*
           * Open, in the sense somebody would recognise: still theirs to move.
           * Delivered work is done, dropped and superseded are decisions
           * already taken, and none of the three is something you are working
           * on.
           */
          and c.status in ('promised', 'in_progress', 'partial', 'blocked')
        -- DISTINCT ON keeps the first row per title, so the newest week wins.
        order by lower(btrim(c.title)), cy.starts_on desc
      ) t
      order by t.starts_on desc, t.prio desc, t.title
      limit ${limit}
    `,
  );
}

/**
 * One entry in the person's own activity stream.
 *
 * Two kinds, because a week has two kinds of record in it: what they told
 * NEXUS, and what happened to the work. They share a shape so the surface can
 * merge them into one chronological list rather than asking the reader to
 * reconcile two.
 */
export type ActivityEntry =
  | ({ kind: "commitment"; at: string; target_label: string } & CommitmentRow)
  | {
      kind: "report";
      at: string;
      id: string;
      /** Exactly what the person wrote. Never a paraphrase — see migration 0002. */
      raw_text: string;
      /** The week this reported on, "W35 · 24 Aug–30 Aug". */
      cycle_label: string;
      /** Whether extraction has run over it yet. */
      status: string;
    };

/**
 * WHAT THIS PERSON HAS BEEN DOING, most recent first.
 *
 * My Week asks a different question from Tasks, and this is the difference.
 * Tasks asks "what is still mine to move" and is answered by `liveCommitments`
 * — the open set, whichever week it belongs to. This asks "what have I been
 * doing", which is a question about MOVEMENT and includes work that is
 * finished, dropped or deferred. A finished commitment is the most relevant
 * thing that happened to somebody's week and the open set is precisely where
 * it does not appear.
 *
 * ORDERED BY WHEN THE ROW LAST MOVED, not by the week it was promised for.
 * A commitment delivered on Thursday for a week that began in July belongs at
 * the top of Thursday, not buried under July. `moved_at` is the newest
 * timestamp the application itself wrote for that row — delivered, then
 * declared, then created — so every value in the ordering is a real event,
 * never an estimate.
 *
 * NOT collapsed by title, unlike `liveCommitments`. There, twelve rows for
 * three jobs was a lie about how much was open. Here each row IS an event: the
 * same promise renewed in three weeks and delivered in the fourth is four
 * things that happened, and flattening them would hide the history this stream
 * exists to show.
 */
export async function recentActivity(
  actor: string,
  profileId: string,
  limit = 12,
): Promise<ActivityEntry[]> {
  const rows = await asActor(
    actor,
    (sql) => sql<CommitmentRow & { target_label: string; moved_at: string }>`
      select
        t.id, t.title, t.category, t.priority, t.status, t.was_planned,
        t.deviation_declared, t.blocker_kind, t.depends_on_department,
        t.carry_depth, t.source_quote,
        t.estimated_effort_hours, t.actual_effort_hours,
        t.description, t.outcome_reason, t.due_on,
        t.created_at, t.declared_at, t.delivered_at,
        t.target_label, t.moved_at
      from (
      select distinct on (lower(btrim(c.title)))
        c.id, c.title, c.category, c.priority::text as priority,
        c.status::text as status, c.was_planned, c.deviation_declared,
        c.blocker_kind::text as blocker_kind,
        d.name as depends_on_department,
        /*
         * How many times this same promise has been made, counted over the
         * whole person's record rather than the page of it being returned —
         * a window function is applied before LIMIT, so the figure does not
         * change with the size of the list.
         *
         * By (person, lower(trim(title))), the same identity liveCommitments
         * uses and the one migration 0020 enforces for a single week. NOT via
         * carried_from_commitment_id: nothing in the application has ever
         * written that column, so every chain on a real database is length
         * one.
         */
        count(*) over (partition by lower(btrim(c.title)))::int as carry_depth,
        c.source_quote,
        c.estimated_effort_hours::float8, c.actual_effort_hours::float8,
        c.description, c.outcome_reason, c.due_on,
        c.created_at, c.declared_at, c.delivered_at,
        cy.label as target_label,
        greatest(
          c.created_at,
          coalesce(c.declared_at, c.created_at),
          coalesce(c.delivered_at, c.created_at)
        ) as moved_at
      from commitments c
      join cycles cy on cy.id = c.target_cycle_id
      left join departments d on d.id = c.depends_on_department_id
      where c.profile_id = ${profileId}
        and c.deleted_at is null
      /*
       * ONE ENTRY PER PIECE OF WORK, NEWEST STATE FIRST.
       *
       * A promise renewed each week is a NEW commitment row each week, so the
       * uncollapsed stream showed the same blocked item four times with four
       * identical summaries — rejected-patterns.md #13, the shape a reader
       * learns to skip. The repetition is not lost: carry_depth above counts
       * it, and the detail view states it as "carried 4x".
       *
       * Same identity as liveCommitments — (person, lower(trim(title))) — so
       * the two lists cannot disagree about what counts as one job.
       */
      order by lower(btrim(c.title)), moved_at desc
      ) t
      order by t.moved_at desc
      limit ${limit}
    `,
  );

  return rows.map(({ moved_at, ...c }) => ({
    kind: "commitment" as const,
    at: moved_at,
    ...c,
  }));
}

/**
 * The reports this person has actually filed, newest first.
 *
 * `raw_text` is the human's own words and nothing else — the extractor's
 * output, the assistant's prompts and the transcript all live elsewhere. It is
 * shown back to them here because a person reviewing their week should be able
 * to read what they said, in the words they said it in.
 *
 * Read through asActor and scoped to their own profile: policy `check_ins_own`
 * restricts these rows to their author, which is exactly right and is why this
 * cannot be a shared query.
 */
export async function recentReports(
  actor: string,
  profileId: string,
  limit = 6,
): Promise<Extract<ActivityEntry, { kind: "report" }>[]> {
  const rows = await asActor(
    actor,
    (sql) => sql<{
      id: string;
      raw_text: string;
      cycle_label: string;
      status: string;
      responded_at: string;
    }>`
      select ci.id, ci.raw_text, cy.label as cycle_label,
             ci.status::text as status, ci.responded_at
      from check_ins ci
      join cycles cy on cy.id = ci.cycle_id
      where ci.profile_id = ${profileId}
        and ci.responded_at is not null
        and ci.raw_text is not null
        and btrim(ci.raw_text) <> ''
      order by ci.responded_at desc
      limit ${limit}
    `,
  );

  return rows.map((r) => ({
    kind: "report" as const,
    at: r.responded_at,
    id: r.id,
    raw_text: r.raw_text,
    cycle_label: r.cycle_label,
    status: r.status,
  }));
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
      /*
       * THE UNIT UNDER A NAME IS THAT PERSON'S UNIT.
       *
       * This joined commitments.department_id — which unit the WORK was
       * categorised into, written by the extractor and null whenever it could
       * not tell. The label sits directly beneath somebody's name, so the
       * Chairman read "Suleman Olalomi / Unassigned" and concluded Suleman
       * belonged to no unit. He did: the commitment did not.
       *
       * Two different facts had the same column name in two different tables,
       * and the screen was showing the wrong one. profiles.department_id is
       * who somebody is; commitments.department_id is what the work is about.
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
        left join departments d on d.id = p.department_id
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

/*
 * The Chairman's most recent weekly brief, as STORED.
 *
 * Migration 0005 wrote the digests table structured-first for exactly this:
 * "the email template reads summary_json; html is a derived artifact. That
 * ordering keeps the same briefing usable in the web UI, in email, and (later)
 * in Slack without regenerating it." This is the web UI half of that promise.
 *
 * Nothing here calls a model. `weeklyBrief` once regenerated on every render
 * and then preferred the stored value anyway — 22-34 seconds of blocking work
 * on a home page, paid for an answer it discarded (GUIDE §14). The brief on
 * screen is the same object that rendered the email, so the two can never
 * disagree about what the week was.
 *
 * `status = 'sent'` because this is the companion to a briefing he received,
 * not a preview of one he has not. It is reachable even with no mail
 * configured: schedule.ts marks a digest sent once it has no deliverable
 * recipients left, rather than retrying forever.
 */
export type WeeklyBrief = {
  id: string;
  cycleLabel: string | null;
  headline: string;
  whatChanged: string[];
  decisions: { risk: string; action: string; concerns?: string }[];
  praise: string[];
  /** The week grouped into threads, each naming who it came from. */
  threads: { headline: string; detail: string; people: string[] }[];
  /** Who filed nothing. Counted from records, never written by the model. */
  silent: string[];
  /** Name -> profile, so a name in a thread can be opened. */
  roster: { name: string; profileId: string }[];
};

type DigestRow = {
  id: string;
  cycle_label: string | null;
  summary_json: unknown;
};

/** Defensive: summary_json is jsonb written by one build and read by another. */
function strings(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .slice(0, cap);
}

export async function latestWeeklyBrief(actor: string): Promise<WeeklyBrief | null> {
  const rows = await asActor(
    actor,
    (sql) => sql<DigestRow>`
      select d.id, c.label as cycle_label, d.summary_json
      from digests d
      left join cycles c on c.id = d.cycle_id
      where d.scope = 'executive'
        and d.period = 'weekly'
        /*
         * WRITTEN IS ENOUGH. It used to require 'sent', which tied the
         * Chairman's own page to the mail transport: a Resend outage, an
         * unroutable address or a stale sender domain meant the briefing
         * existed, was correct, and was invisible to the one person it was
         * written for.
         *
         * Email is a convenience — it lets him read the week without signing
         * in. The page is the product. Nothing is shown before a briefing is
         * written, and a briefing with no headline is still refused below, so
         * relaxing this cannot surface an empty artefact.
         */
        and d.status in ('generated', 'sent')
      /*
       * Newest WEEK first, not newest send. Ordering by sent_at put every
       * unsent briefing last — so the moment 'generated' was admitted above, a
       * brief written seconds ago would have lost to one emailed a fortnight
       * back, and the relaxation would have achieved nothing.
       */
      order by c.starts_on desc nulls last,
               coalesce(d.sent_at, d.created_at) desc
      limit 1
    `,
  );

  const row = rows[0];
  if (!row) return null;

  const s = row.summary_json;
  if (typeof s !== "object" || s === null || Array.isArray(s)) return null;
  const summary = s as Record<string, unknown>;

  /*
   * Tolerate at the edge, refuse to render nothing (rejected-patterns §14).
   * A briefing with no headline is the empty-artefact case that once went out
   * by email looking perfectly fine. Here it means no modal at all.
   */
  const headline = typeof summary.headline === "string" ? summary.headline.trim() : "";
  if (!headline) return null;

  const decisions = Array.isArray(summary.decisions)
    ? summary.decisions
        .filter(
          (d): d is { risk: string; action: string; concerns?: string } =>
            typeof d === "object" &&
            d !== null &&
            typeof (d as { risk?: unknown }).risk === "string" &&
            typeof (d as { action?: unknown }).action === "string",
        )
        .slice(0, 4)
    : [];

  const threads = Array.isArray(summary.threads)
    ? summary.threads
        .filter(
          (t): t is { headline: string; detail: string; people: string[] } =>
            typeof t === "object" &&
            t !== null &&
            typeof (t as { headline?: unknown }).headline === "string" &&
            typeof (t as { detail?: unknown }).detail === "string",
        )
        .map((t) => ({
          headline: t.headline,
          detail: t.detail,
          people: Array.isArray(t.people)
            ? t.people.filter((n): n is string => typeof n === "string")
            : [],
        }))
        .slice(0, 7)
    : [];

  const roster = Array.isArray(summary.roster)
    ? summary.roster.filter(
        (r): r is { name: string; profileId: string } =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as { name?: unknown }).name === "string" &&
          typeof (r as { profileId?: unknown }).profileId === "string",
      )
    : [];

  return {
    id: row.id,
    cycleLabel: row.cycle_label,
    headline,
    whatChanged: strings(summary.whatChanged, 4),
    decisions,
    praise: strings(summary.praise, 2),
    threads,
    silent: strings(summary.silent, 40),
    roster,
  };
}

/*
 * What each person reported for a cycle, and what they plan for the next one.
 *
 * SOURCED FROM COMMITMENTS, NEVER FROM CHECK-IN TEXT. `check_ins` is
 * author-only in RLS — "the plan is shared; the raw words behind it are not"
 * (migration 0006). Commitments are org-visible and carry the person's own
 * verbatim `source_quote`, which is why every upward-facing surface in this
 * product reads them instead. Whether somebody reported at all comes from
 * `submission_status`, the envelope view: arrived, when, how long, never what
 * it said.
 *
 * `reported` is the distinction rule 5 turns on. Somebody who filed nothing is
 * NOT somebody with an empty week, and the two must never render the same way.
 */
export type PersonWeek = {
  profileId: string;
  fullName: string;
  departmentName: string | null;
  reported: boolean;
  /** Landed this cycle. */
  delivered: string[];
  /** Committed to this cycle and still open at the end of it. */
  open: string[];
  /** Held up by another unit. Never counted against the person. */
  blocked: { title: string; blockingUnit: string | null }[];
  /** What they committed to for the cycle that follows. */
  planned: string[];
};

export async function weeklyPersonReports(
  actor: string,
  cycleId: string,
  /** Narrow to one unit. Omitted, this returns everybody the actor may see. */
  departmentId?: string,
): Promise<PersonWeek[]> {
  return asActor(
    actor,
    (sql) => sql<PersonWeek>`
      with this_cycle as (
        select id, org_id, starts_on, kind from cycles where id = ${cycleId}
      ),
      next_cycle as (
        select n.id
        from cycles n, this_cycle t
        where n.org_id = t.org_id and n.kind = t.kind
          and n.starts_on > t.starts_on
        order by n.starts_on
        limit 1
      )
      select
        p.id                  as "profileId",
        p.full_name           as "fullName",
        d.name                as "departmentName",
        coalesce(bool_or(ss.submitted), false) as reported,

        coalesce((
          select json_agg(c.title order by c.created_at)
          from commitments c
          where c.profile_id = p.id and c.target_cycle_id = ${cycleId}
            and c.deleted_at is null
            and c.status in ('delivered', 'partial')
        ), '[]'::json) as delivered,

        coalesce((
          select json_agg(c.title order by c.created_at)
          from commitments c
          where c.profile_id = p.id and c.target_cycle_id = ${cycleId}
            and c.deleted_at is null
            and c.status in ('promised', 'in_progress', 'deferred')
        ), '[]'::json) as open,

        coalesce((
          select json_agg(json_build_object(
                   'title', c.title,
                   'blockingUnit', bd.name
                 ) order by c.created_at)
          from commitments c
          left join departments bd on bd.id = c.depends_on_department_id
          where c.profile_id = p.id and c.target_cycle_id = ${cycleId}
            and c.deleted_at is null
            and c.status = 'blocked'
        ), '[]'::json) as blocked,

        coalesce((
          select json_agg(c.title order by c.created_at)
          from commitments c
          where c.profile_id = p.id
            and c.target_cycle_id = (select id from next_cycle)
            and c.deleted_at is null
            and c.status not in ('dropped', 'superseded')
        ), '[]'::json) as planned

      from profiles p
      left join departments d on d.id = p.department_id
      left join submission_status ss
        on ss.profile_id = p.id and ss.cycle_id = ${cycleId}
      where p.status = 'active'
        /*
         * Everybody but the Chairman, which is the rule migration 0015 settled:
         * an administrator is a staff member with extra capability, not a
         * different kind of person, and runPrompt opens a check-in for them
         * on exactly that basis.
         *
         * This query was written later and reintroduced the old list, so an
         * administrator could file a full week and appear nowhere — not in the
         * Chairman's per-person view, not in a thread, and not in the silent
         * column either. Diligent and invisible, which is the worst of both.
         */
        and p.role <> 'executive'
        and (${departmentId ?? null}::uuid is null
             or p.department_id = ${departmentId ?? null}::uuid)
      group by p.id, p.full_name, d.name
      order by d.name nulls last, p.full_name
    `,
  );
}

/**
 * The organisation's totals for one cycle, counted from PEOPLE.
 *
 * WHY THIS EXISTS. Every figure in the executive briefing was a roll-up of
 * `brief.departments` — summed across units, averaged across units. That is
 * correct arithmetic over the wrong set: an organisation with no departments
 * has no rows to roll up, so every count came out zero and every rate came out
 * null.
 *
 * The consequence was not a blank space. Two people filed full reports and the
 * Chairman's briefing opened with "No unit reports or findings this week" —
 * the model faithfully describing figures that were wrong. That is precisely
 * the inversion this codebase exists to prevent: numbers are supposed to come
 * from the application so the model cannot be caught being wrong, and here the
 * application was the one being wrong.
 *
 * Departments are a way of GROUPING people. People are the fact. So the totals
 * are counted from profiles and their reconciliations directly, and work
 * identically whether an organisation has twenty units or none.
 *
 * Read as the Chairman, through RLS, like everything else that reaches him.
 */
export async function cycleTotals(
  actor: string,
  cycleId: string,
): Promise<{
  peopleReporting: number;
  peopleResponded: number;
  deliveryRate: number | null;
  signalIntegrity: number | null;
  silentDropCount: number;
  protectedCount: number;
  unplannedCount: number;
  carryoverCount: number;
}> {
  const rows = await asActor(
    actor,
    (sql) => sql<{
      people_reporting: number;
      people_responded: number;
      delivery_rate: string | null;
      signal_integrity: string | null;
      silent_drop_count: number;
      protected_count: number;
      unplanned_count: number;
      carryover_count: number;
    }>`
      select
        count(p.id)::int                                as people_reporting,
        count(*) filter (where r.responded)::int        as people_responded,
        /*
         * Averaged over people who actually reported. Including a silent week
         * as a zero would make "nobody filed" indistinguishable from "everybody
         * filed and delivered nothing", and only one of those is about effort.
         */
        avg(r.delivery_rate) filter (where r.responded)     as delivery_rate,
        avg(r.signal_integrity) filter (where r.responded)  as signal_integrity,
        coalesce(sum(r.silent_drop_count), 0)::int      as silent_drop_count,
        coalesce(sum(r.protected_count), 0)::int        as protected_count,
        coalesce(sum(r.unplanned_count), 0)::int        as unplanned_count,
        coalesce(sum(r.carryover_count), 0)::int        as carryover_count
      from profiles p
      left join reconciliations r
        on r.profile_id = p.id and r.cycle_id = ${cycleId}
      where p.org_id = (select org_id from cycles where id = ${cycleId})
        and p.status = 'active'
        -- Same rule as everywhere else: everybody but the Chairman.
        and p.role <> 'executive'
    `,
  );

  const r = rows[0];
  const num = (v: string | null) => (v === null ? null : Math.round(Number(v)));
  return {
    peopleReporting: r?.people_reporting ?? 0,
    peopleResponded: r?.people_responded ?? 0,
    deliveryRate: num(r?.delivery_rate ?? null),
    signalIntegrity: num(r?.signal_integrity ?? null),
    silentDropCount: r?.silent_drop_count ?? 0,
    protectedCount: r?.protected_count ?? 0,
    unplannedCount: r?.unplanned_count ?? 0,
    carryoverCount: r?.carryover_count ?? 0,
  };
}

/**
 * The week this person has actually been asked to report on.
 *
 * THE RHYTHM DECIDES, NOT THE CALENDAR. `runPrompt` creates a check_in row
 * against the cycle it opened; this returns that cycle, so the interface files
 * against the same week the person was asked about.
 *
 * Without it the two disagreed permanently. `recentCycles` excludes the current
 * week — `starts_on < date_trunc('week', current_date)` — so `/my-week` showed
 * LAST week for the whole of this one, while the prompt opened THIS week.
 * Somebody following "your check-in is open" filed against a different week
 * than the one that had been opened for them, every single time.
 *
 * Null when nothing is open — the prompt has not run, or they have already
 * answered everything. The caller falls back to the most recent settled week,
 * which is the right place to be when there is nothing waiting.
 */
export async function openCheckInCycle(
  actor: string,
  profileId: string,
): Promise<Cycle | null> {
  const rows = await asActor(
    actor,
    (sql) => sql<Cycle>`
      select cy.id, cy.label, cy.starts_on, cy.ends_on, cy.seq
      from check_ins ci
      join cycles cy on cy.id = ci.cycle_id
      where ci.profile_id = ${profileId}
        and ci.responded_at is null
        and ci.status in ('pending', 'prompted')
      order by cy.starts_on desc
      limit 1
    `,
  );
  return rows[0] ?? null;
}

/**
 * The weeks this person actually has work in, newest first.
 *
 * WHY NOT `recentCycles`. That returns a WINDOW of the calendar and excludes
 * the current week, so a page built on it can only show work that happens to
 * fall inside the window it guessed. Somebody who reported on the week that
 * just ended has plans targeting the week they are now in — outside the
 * window, and therefore invisible. Their Tasks page said "Nothing recorded
 * yet" while three commitments sat in the database.
 *
 * This asks the question the page is actually asking: which weeks does this
 * person have commitments in? No window, no guess, and it cannot omit a week
 * that has work in it.
 */
export type LedgerWeek = {
  id: string;
  label: string;
  starts_on: string;
  ends_on: string;
  /** Everything targeted at this week. */
  promised: number;
  /** How many of them closed as delivered. */
  delivered: number;
};

/**
 * One row per week that has work in it, with the two figures a week is judged
 * on. For the week ledger — see components/ui/week-ledger.tsx.
 *
 * WHY NOT `personTrend`, WHICH ALREADY RETURNS A DELIVERY RATE.
 *
 * That reads `reconciliations`, and a reconciliation only exists once a week
 * has settled. The ledger has to show the week you are standing in, which by
 * definition has not settled, and the weeks behind it whether or not the
 * rhythm has closed them. Counting the commitments themselves is the only
 * form of the question that can answer for every week on screen.
 *
 * WHY NOT `cyclesWithWork` PLUS `commitmentsFor` PER WEEK, which is what the
 * Tasks page does: that is six round trips to render seven numbers, and it
 * pulls every commitment body across to count them.
 */
export async function weekLedger(
  actor: string,
  profileId: string,
  limit = 8,
): Promise<LedgerWeek[]> {
  return asActor(
    actor,
    (sql) => sql<LedgerWeek>`
      select
        cy.id, cy.label, cy.starts_on, cy.ends_on,
        count(*)::int as promised,
        count(*) filter (where c.status = 'delivered')::int as delivered
      from cycles cy
      join commitments c on c.target_cycle_id = cy.id
      where c.profile_id = ${profileId}
        and c.deleted_at is null
      group by cy.id, cy.label, cy.starts_on, cy.ends_on
      order by cy.starts_on desc
      limit ${limit}
    `,
  );
}

export async function cyclesWithWork(
  actor: string,
  profileId: string,
  limit = 6,
): Promise<Cycle[]> {
  return asActor(
    actor,
    (sql) => sql<Cycle>`
      select distinct cy.id, cy.label, cy.starts_on, cy.ends_on, cy.seq
      from cycles cy
      join commitments c on c.target_cycle_id = cy.id
      where c.profile_id = ${profileId}
        and c.deleted_at is null
      order by cy.starts_on desc
      limit ${limit}
    `,
  );
}
