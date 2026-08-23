-- ============================================================================
-- NEXUS 0004 — Reconciliation & scoring
--
-- THE RULE THIS FILE EXISTS TO ENFORCE:
--   Numbers come from SQL. Prose comes from the model. Never the reverse.
--
-- Every figure that reaches an executive's inbox is computed here, is stable
-- across runs, and can be recomputed from source rows at any time. The model
-- is handed these numbers and writes English about them. The first time an
-- executive spot-checks a percentage and finds the machine invented it, the
-- product is dead — so the machine is never given the chance.
--
-- TWO SCORES, NEVER ONE
--
--   delivery_rate     did the work land?
--   signal_integrity  did you tell us the truth, in time?
--
-- Collapsing these into a single "commitment score" is the mistake that kills
-- this category of product. One number means the safest strategy is to promise
-- less, and once people sandbag, every downstream figure is fiction. Split in
-- two, the incentives invert: declaring a slip on Tuesday *protects* your
-- integrity score, so the system is rewarded with early truth instead of
-- late discovery. A person at 60% delivery / 100% integrity is not a problem
-- employee — they are an overloaded one, and that is a management finding.
-- ============================================================================

create type reconciliation_status as enum (
  'draft',              -- computed, narrative not yet generated
  'awaiting_employee',  -- in the correction window; NOT yet visible upward
  'confirmed',          -- employee reviewed
  'auto_confirmed',     -- window elapsed with no response
  'skipped'             -- no check-in, nothing to reconcile
);

create table reconciliations (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  profile_id        uuid not null references profiles(id) on delete cascade,
  cycle_id          uuid not null references cycles(id) on delete cascade,

  status            reconciliation_status not null default 'draft',

  -- ---- counters (SQL-computed) -----------------------------------------
  promised_count      integer not null default 0,
  delivered_count     integer not null default 0,
  partial_count       integer not null default 0,
  deferred_count      integer not null default 0,
  blocked_count       integer not null default 0,
  dropped_count       integer not null default 0,
  silent_drop_count   integer not null default 0,  -- dropped/deferred, never declared
  carryover_count     integer not null default 0,  -- arrived from a previous cycle
  unplanned_count     integer not null default 0,  -- done but never promised
  protected_count     integer not null default 0,  -- excluded: blocked by others

  -- ---- scores (0..100, SQL-computed) ------------------------------------
  delivery_rate       numeric(5,2),
  signal_integrity    numeric(5,2),
  focus_ratio         numeric(5,2),   -- share of effort that was actually planned

  responded           boolean not null default false,

  -- ---- generated content -------------------------------------------------
  ai_narrative      text,
  ai_coaching       jsonb not null default '[]'::jsonb,
  ai_questions      jsonb not null default '[]'::jsonb,  -- "you didn't mention X — done, dropped, or still going?"

  -- ---- the employee's correction window ----------------------------------
  employee_note     text,
  review_due_at     timestamptz,
  confirmed_at      timestamptz,

  computed_at       timestamptz,
  generated_at      timestamptz,
  model             text,
  cost_usd          numeric(10,6),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (profile_id, cycle_id)
);

create index reconciliations_org_cycle_idx on reconciliations (org_id, cycle_id);
create index reconciliations_status_idx on reconciliations (status);
create index reconciliations_review_due_idx on reconciliations (review_due_at)
  where status = 'awaiting_employee';

create trigger reconciliations_updated_at
  before update on reconciliations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- compute_reconciliation_metrics
--
-- Pure and side-effect free so tests can assert on it directly against the
-- seeded fixtures without writing rows.
--
-- Denominator exclusions, and why each one is deliberate:
--
--   superseded            replaced by a different commitment; not a failure.
--
--   blocked by another    THE MOST IMPORTANT LINE IN THIS FILE. If being
--   team/party, declared  blocked by Design hurts an engineer's score, the
--                         engineer stops declaring dependencies within one
--                         cycle, and the dependency graph — the thing that
--                         lets an executive fix the actual bottleneck — goes
--                         dark forever. Note it must be *declared*: silently
--                         going dark and claiming "blocked" afterwards earns
--                         no protection.
--
--   was_planned = false   unplanned work is real work but it is not a promise;
--                         it is measured by focus_ratio instead, so it neither
--                         inflates nor deflates promise-keeping.
-- ---------------------------------------------------------------------------

create or replace function compute_reconciliation_metrics(
  p_profile_id uuid,
  p_cycle_id   uuid
)
returns table (
  promised_count    integer,
  delivered_count   integer,
  partial_count     integer,
  deferred_count    integer,
  blocked_count     integer,
  dropped_count     integer,
  silent_drop_count integer,
  carryover_count   integer,
  unplanned_count   integer,
  protected_count   integer,
  delivery_rate     numeric,
  signal_integrity  numeric,
  focus_ratio       numeric,
  responded         boolean
)
language plpgsql
stable
as $$
declare
  v_responded boolean;
begin
  select exists (
    select 1 from check_ins ci
    where ci.profile_id = p_profile_id
      and ci.cycle_id   = p_cycle_id
      and ci.status in ('responded', 'parsed')
  ) into v_responded;

  return query
  with scoped as (
    select
      c.*,
      priority_weight(c.priority) as w,
      -- protected: genuinely blocked by someone else, and said so in time
      (c.status = 'blocked'
        and c.blocker_kind in ('external_team', 'external_party')
        and c.deviation_declared) as is_protected
    from commitments c
    where c.profile_id      = p_profile_id
      and c.target_cycle_id = p_cycle_id
      and c.deleted_at is null
  ),
  planned as (
    select * from scoped
    where was_planned
      and status <> 'superseded'
      and not is_protected
  ),
  deviations as (
    -- anything that did not fully land is a deviation the org deserved to
    -- hear about before the cycle closed
    select * from planned where status <> 'delivered'
  )
  -- Every outcome counter below is scoped to PLANNED work, so the set of
  -- counts always describes one population and delivered_count can never
  -- exceed promised_count. Work that was done but never promised is reported
  -- separately as unplanned_count and focus_ratio — mixing the two here would
  -- produce a summary that reads "promised 4, delivered 5".
  select
    (select count(*) from scoped where was_planned)::integer,
    (select count(*) from scoped where was_planned and status = 'delivered')::integer,
    (select count(*) from scoped where was_planned and status = 'partial')::integer,
    (select count(*) from scoped where was_planned and status = 'deferred')::integer,
    (select count(*) from scoped where was_planned and status = 'blocked')::integer,
    (select count(*) from scoped where was_planned and status = 'dropped')::integer,
    (select count(*) from scoped
       where was_planned
         and status in ('dropped', 'deferred')
         and not deviation_declared)::integer,
    (select count(*) from scoped
       where was_planned and carried_from_commitment_id is not null)::integer,
    (select count(*) from scoped where not was_planned)::integer,
    (select count(*) from scoped where was_planned and is_protected)::integer,

    -- delivery_rate: weighted credit over weighted planned load
    (select case
              when coalesce(sum(w), 0) = 0 then null
              else round(
                100 * sum(w * case status
                                when 'delivered' then 1.0
                                when 'partial'   then 0.5
                                else 0
                              end) / sum(w), 2)
            end
     from planned),

    -- signal_integrity: of everything that deviated, how much was declared?
    -- No deviations at all is a clean 100. No check-in at all is 0 — silence
    -- is precisely the failure this score exists to catch.
    (select case
              when not v_responded then 0::numeric
              when coalesce((select sum(w) from deviations), 0) = 0 then 100::numeric
              else round(
                100 * (select coalesce(sum(w), 0) from deviations where deviation_declared)
                    / (select sum(w) from deviations), 2)
            end),

    -- focus_ratio: of the work that actually got done, how much was planned?
    (select case
              when coalesce(sum(w) filter (where status in ('delivered', 'partial')), 0) = 0
                then null
              else round(
                100 * sum(w) filter (where status in ('delivered','partial') and was_planned)
                    / sum(w) filter (where status in ('delivered','partial')), 2)
            end
     from scoped),

    v_responded;
end;
$$;

-- ---------------------------------------------------------------------------
-- refresh_reconciliation — recompute and upsert. Idempotent by design; the
-- cron tick may call it repeatedly for the same cycle without harm.
--
-- Deliberately does NOT touch ai_narrative, ai_coaching or employee_note:
-- recomputing the arithmetic must never silently discard something a human
-- wrote or a generation we already paid for.
-- ---------------------------------------------------------------------------

create or replace function refresh_reconciliation(
  p_profile_id uuid,
  p_cycle_id   uuid
)
returns uuid
language plpgsql
as $$
declare
  m record;
  v_org_id uuid;
  v_id uuid;
  v_review_hours integer;
begin
  select org_id into v_org_id from profiles where id = p_profile_id;

  select coalesce((o.settings ->> 'review_window_hours')::integer, 24)
    into v_review_hours
  from organizations o where o.id = v_org_id;

  select * into m from compute_reconciliation_metrics(p_profile_id, p_cycle_id);

  insert into reconciliations as r (
    org_id, profile_id, cycle_id,
    promised_count, delivered_count, partial_count, deferred_count,
    blocked_count, dropped_count, silent_drop_count, carryover_count,
    unplanned_count, protected_count,
    delivery_rate, signal_integrity, focus_ratio, responded,
    status, review_due_at, computed_at
  )
  values (
    v_org_id, p_profile_id, p_cycle_id,
    m.promised_count, m.delivered_count, m.partial_count, m.deferred_count,
    m.blocked_count, m.dropped_count, m.silent_drop_count, m.carryover_count,
    m.unplanned_count, m.protected_count,
    m.delivery_rate, m.signal_integrity, m.focus_ratio, m.responded,
    (case when m.responded then 'draft' else 'skipped' end)::reconciliation_status,
    now() + make_interval(hours => v_review_hours),
    now()
  )
  on conflict (profile_id, cycle_id) do update set
    promised_count    = excluded.promised_count,
    delivered_count   = excluded.delivered_count,
    partial_count     = excluded.partial_count,
    deferred_count    = excluded.deferred_count,
    blocked_count     = excluded.blocked_count,
    dropped_count     = excluded.dropped_count,
    silent_drop_count = excluded.silent_drop_count,
    carryover_count   = excluded.carryover_count,
    unplanned_count   = excluded.unplanned_count,
    protected_count   = excluded.protected_count,
    delivery_rate     = excluded.delivery_rate,
    signal_integrity  = excluded.signal_integrity,
    focus_ratio       = excluded.focus_ratio,
    responded         = excluded.responded,
    computed_at       = excluded.computed_at
  returning r.id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Department and org rollups.
--
-- Views rather than materialised tables: the executive dashboard must never
-- show a number staler than the drill-down that explains it. If these get slow
-- at scale, materialise them WITH a visible "as of" timestamp in the UI — the
-- staleness has to be admitted, not hidden.
--
-- Aggregate-by-default is a product stance, not just a query convenience: the
-- executive's landing view is team health, and reaching an individual is a
-- deliberate act framed as offering support, never a leaderboard.
--
-- ---------------------------------------------------------------------------
-- SECURITY_INVOKER IS NOT OPTIONAL HERE.
--
-- A PostgreSQL view executes with the privileges of its OWNER. These views are
-- created by the migration runner, so without this setting every policy on
-- `reconciliations` would be evaluated as that superuser and the view would
-- hand the whole organisation's numbers to anyone who selected from it —
-- routing straight around the "the employee sees it first" rule that the rest
-- of this codebase works so hard to enforce.
--
-- Measured, not assumed: scripts/probe-view-rls.mjs demonstrates the leak
-- (a staff member reading 120 rows through the view where the policy allows
-- 8), and tests/rls.test.ts holds the fix in place.
-- ---------------------------------------------------------------------------

create view department_cycle_health
with (security_invoker = true)
as
select
  d.id                                as department_id,
  d.org_id,
  d.name                              as department_name,
  d.color,
  r.cycle_id,
  count(*)                            as people_reporting,
  count(*) filter (where r.responded) as people_responded,
  round(avg(r.delivery_rate)    filter (where r.delivery_rate    is not null), 2) as delivery_rate,
  round(avg(r.signal_integrity) filter (where r.signal_integrity is not null), 2) as signal_integrity,
  round(avg(r.focus_ratio)      filter (where r.focus_ratio      is not null), 2) as focus_ratio,
  sum(r.promised_count)     as promised_count,
  sum(r.delivered_count)    as delivered_count,
  sum(r.silent_drop_count)  as silent_drop_count,
  sum(r.carryover_count)    as carryover_count,
  sum(r.unplanned_count)    as unplanned_count,
  sum(r.protected_count)    as protected_count
from reconciliations r
join profiles d_p on d_p.id = r.profile_id
join departments d on d.id = d_p.department_id
group by d.id, d.org_id, d.name, d.color, r.cycle_id;

-- Live dependency edges: who is currently waiting on whom, and how loudly.
-- security_invoker for the same reason as above — this one reads commitments,
-- which are scoped by department.
create view dependency_edges
with (security_invoker = true)
as
select
  c.org_id,
  c.target_cycle_id                as cycle_id,
  c.department_id                  as from_department_id,
  c.depends_on_department_id       as to_department_id,
  count(*)                         as blocked_count,
  sum(priority_weight(c.priority)) as blocked_weight,
  min(c.created_at)                as oldest_since
from commitments c
where c.deleted_at is null
  and c.depends_on_department_id is not null
  and c.depends_on_department_id <> c.department_id
  and c.status in ('blocked', 'promised', 'in_progress')
group by c.org_id, c.target_cycle_id, c.department_id, c.depends_on_department_id;
