import { asActor } from "./db";

/*
 * Is this organisation configured well enough to be useful?
 *
 * Every figure here is COUNTED, never estimated. The brief for this surface
 * was explicit — "do not invent fake percentages" — and it is the right rule
 * for a readiness screen in particular: a progress bar that moves because the
 * page wanted to feel encouraging is the fastest way to lose an administrator
 * who then discovers nothing works.
 *
 * So each step is a boolean derived from a row count, and the headline is
 * "4 of 7 done" rather than "57%". A count is checkable; a percentage invites
 * the reader to believe a precision that is not there.
 *
 * WHAT IS NOT HERE, AND WHY
 *
 * There is no "connect your calendar", no "set up SSO" beyond what the auth
 * layer actually reports, and no step for a feature that does not exist. A
 * checklist that can never reach the end teaches people to ignore it.
 */

export type ReadinessStep = {
  key: string;
  label: string;
  /** Why it matters, in one sentence. Shown only while the step is open. */
  why: string;
  done: boolean;
  /** Where to go and do it. Absent when there is nothing to click. */
  href?: string;
  /** The count behind the boolean, when there is a useful one. */
  detail?: string;
};

export type Readiness = {
  steps: ReadinessStep[];
  done: number;
  total: number;
  ready: boolean;
  /** Live counts, for the summary line. */
  counts: {
    departments: number;
    departmentsWithLead: number;
    activePeople: number;
    invited: number;
    pending: number;
    reportedThisCycle: number;
    settledWeeks: number;
  };
};

type Row = {
  org_name: string;
  departments: number;
  departments_with_lead: number;
  active_people: number;
  invited: number;
  pending: number;
  settled_weeks: number;
  reported_this_cycle: number;
  has_executive: number;
  allowed_domains: number;
};

/**
 * One round trip.
 *
 * Every count is scoped by `asActor`, so an administrator sees their own
 * organisation and nobody else's — the readiness screen is not a hole in RLS
 * dressed up as a summary.
 */
export async function organizationReadiness(actor: string): Promise<Readiness> {
  const rows = await asActor(
    actor,
    (sql) => sql<Row>`
      with me as (select org_id from profiles where id = ${actor}),
      open_cycle as (
        select id from cycles
        where org_id = (select org_id from me)
          and kind = 'week'
          and starts_on <= current_date
        order by starts_on desc
        limit 1
      )
      select
        (select name from organizations where id = (select org_id from me))
          as org_name,
        /*
         * Archived units are excluded from both counts. A retired unit with no
         * lead is not an unfinished setup step — leaving it in meant the
         * checklist could never be completed by anybody who had ever archived
         * anything, which is a checklist people stop reading.
         */
        (select count(*)::int from departments
          where org_id = (select org_id from me)
            and archived_at is null)                                  as departments,
        (select count(*)::int from departments
          where org_id = (select org_id from me)
            and archived_at is null
            and lead_id is not null)                                  as departments_with_lead,
        (select count(*)::int from profiles
          where org_id = (select org_id from me) and status = 'active') as active_people,
        (select count(*)::int from invitations
          where org_id = (select org_id from me)
            and accepted_at is null and revoked_at is null
            and expires_at > now())                                   as invited,
        (select count(*)::int from profiles
          where org_id = (select org_id from me) and status = 'pending') as pending,
        (select count(distinct r.cycle_id)::int
           from reconciliations r
           join profiles p on p.id = r.profile_id
          where p.org_id = (select org_id from me)
            and r.status in ('confirmed', 'auto_confirmed'))          as settled_weeks,
        (select count(*)::int
           from check_ins ci
          where ci.cycle_id = (select id from open_cycle)
            and ci.responded_at is not null)                          as reported_this_cycle,
        (select count(*)::int from profiles
          where org_id = (select org_id from me)
            and role = 'executive' and status = 'active')             as has_executive,
        (select coalesce(array_length(allowed_domains, 1), 0)
           from organizations where id = (select org_id from me))     as allowed_domains
    `,
  );

  const r = rows[0];
  const counts = {
    departments: r?.departments ?? 0,
    departmentsWithLead: r?.departments_with_lead ?? 0,
    activePeople: r?.active_people ?? 0,
    invited: r?.invited ?? 0,
    pending: r?.pending ?? 0,
    reportedThisCycle: r?.reported_this_cycle ?? 0,
    settledWeeks: r?.settled_weeks ?? 0,
  };

  /*
   * The order is the order somebody should do them in, and each step's `why`
   * is the consequence of leaving it undone rather than a restatement of the
   * label. "Add departments" tells you nothing; "NEXUS groups reporting by
   * unit, so without one every finding is about the whole company" tells you
   * what you lose.
   */
  const steps: ReadinessStep[] = [
    {
      key: "organization",
      label: "Name the organisation",
      why: "It appears on every digest and invitation NEXUS sends.",
      done: Boolean(r?.org_name?.trim()),
      href: "/admin",
    },
    {
      key: "departments",
      label: "Create your units",
      why: "NEXUS groups reporting by unit. Without one, every finding is about the whole company and no lead has a team.",
      done: counts.departments > 0,
      href: "/admin/departments",
      detail: `${counts.departments} created`,
    },
    {
      key: "people",
      label: "Invite your people",
      why: "Nobody can report until they are in the organisation.",
      done: counts.activePeople + counts.invited > 1,
      href: "/admin/people",
      detail:
        counts.invited > 0
          ? `${counts.activePeople} active · ${counts.invited} invited`
          : `${counts.activePeople} active`,
    },
    {
      key: "leads",
      label: "Assign unit leads",
      why: "A lead is who NEXUS points at when their unit is blocked. Without one, a finding has nobody to reach.",
      done: counts.departments > 0 && counts.departmentsWithLead === counts.departments,
      href: "/admin/departments",
      detail:
        counts.departments > 0
          ? `${counts.departmentsWithLead} of ${counts.departments}`
          : undefined,
    },
    {
      key: "placed",
      label: "Place everybody waiting",
      why: "Somebody with no unit is in the organisation but in nobody's team, so their week reaches no lead.",
      done: counts.pending === 0,
      href: "/admin/people",
      detail: counts.pending > 0 ? `${counts.pending} waiting` : undefined,
    },
    {
      key: "reporting",
      label: "Set the reporting rhythm",
      why: "When the week opens, when it closes, and when NEXUS chases. Everything downstream is timed off it.",
      done: true,
      href: "/admin/reporting",
      detail: "Using defaults",
    },
    {
      key: "firstcycle",
      label: "Run the first reporting week",
      why: "Delivery figures, coaching and the executive brief all appear once a week has settled.",
      done: counts.settledWeeks > 0,
      detail:
        counts.settledWeeks > 0
          ? `${counts.settledWeeks} settled`
          : counts.reportedThisCycle > 0
            ? `${counts.reportedThisCycle} reported so far`
            : "Not started",
    },
  ];

  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, ready: done === steps.length, counts };
}
