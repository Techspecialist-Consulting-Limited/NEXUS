-- ============================================================================
-- 0021 — a week marked "did not report" must be able to change its mind
--
-- WHAT WAS WRONG
--
-- refresh_reconciliation writes 'draft' when the person has responded and
-- 'skipped' when they have not. On conflict it updates every count and the
-- `responded` flag — but deliberately not `status`, because a recompute must
-- never reset somebody's correction window or un-confirm a week they have
-- already seen.
--
-- That exclusion is right for 'awaiting_employee', 'confirmed' and
-- 'auto_confirmed'. It is wrong for 'skipped', and wrong in the one direction
-- that matters:
--
--   1. The rhythm runs at 08:00. Nobody has reported. Every row is written
--      'skipped'.
--   2. At 14:00 the person files their week. Commitments are extracted,
--      reconciliation recomputes, `responded` flips to true, every count
--      becomes real.
--   3. `status` stays 'skipped' forever.
--
-- Nothing promotes 'skipped'. Only 'draft' becomes 'awaiting_employee', and
-- only 'awaiting_employee' becomes 'auto_confirmed'. So the week never settles,
-- the executive digest — which briefs on the most recent SETTLED cycle — finds
-- nothing, and the Chairman is never told anything about a week in which people
-- genuinely reported.
--
-- Measured in production before this migration: Techspecialist Consulting
-- Limited, W35, two people, both 'skipped', both with the reporting week still
-- open. No digest row has ever existed for that organisation.
--
-- This is the same shape of failure as 0020: the chain stops silently, every
-- individual step reports success, and the only symptom is an empty screen.
--
-- WHY ONLY THIS ONE TRANSITION
--
-- 'skipped' is not a decision anybody made. It is the absence of a report, and
-- it stops being true the moment a report arrives. Every other status IS a
-- decision — a window opened, a person confirmed, silence accepted — and a
-- recompute must leave all of them exactly where they are.
--
-- ALSO: the placeholder review window is read in minutes.
--
-- The organisation's window became configurable in minutes rather than hours,
-- so that an organisation can settle a week in ten minutes during a pilot. This
-- function still read the hours key, which meant a fresh row was stamped
-- twenty-four hours out even where ten minutes had been chosen. runReconcile
-- overwrites review_due_at when it opens the window, so nothing was broken by
-- it — but a row that says 24 hours where the organisation chose 10 minutes is
-- a trap for the next person to read it.
-- ============================================================================

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
  v_review_minutes integer;
begin
  select org_id into v_org_id from profiles where id = p_profile_id;

  -- Minutes, falling back to the hours key so an organisation that has not
  -- been re-saved since keeps exactly the window its administrator chose.
  select coalesce(
           (o.settings ->> 'review_window_minutes')::integer,
           coalesce((o.settings ->> 'review_window_hours')::integer, 24) * 60
         )
    into v_review_minutes
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
    now() + make_interval(mins => v_review_minutes),
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
    computed_at       = excluded.computed_at,

    -- The one transition a recompute is allowed to make. Everything else is a
    -- decision somebody took, and stays exactly where they left it.
    status = case
               when r.status = 'skipped' and excluded.responded
                 then 'draft'::reconciliation_status
               else r.status
             end,

    -- A week that has just stopped being skipped has not had a correction
    -- window yet, so it gets one from now. Any other status keeps whatever
    -- window it was already given — resetting a running window would let a
    -- recompute quietly extend a deadline somebody is relying on.
    review_due_at = case
                      when r.status = 'skipped' and excluded.responded
                        then now() + make_interval(mins => v_review_minutes)
                      else r.review_due_at
                    end
  returning r.id into v_id;

  return v_id;
end;
$$;

comment on function refresh_reconciliation(uuid, uuid) is
  'Recompute and upsert one reconciliation. Idempotent. Promotes skipped to '
  'draft when a report finally arrives, and otherwise never touches status.';

-- ---------------------------------------------------------------------------
-- Repair the rows the old behaviour stranded.
--
-- Anybody marked 'skipped' who has in fact responded is a week that reported
-- and was never counted. Put them back in the queue as 'draft' and let the
-- rhythm carry them forward normally: correction window, then settlement.
--
-- Bounded to rows that have not settled, which is every 'skipped' row by
-- definition — stated in the predicate anyway, so a reader does not have to
-- know that to trust the statement.
-- ---------------------------------------------------------------------------
update reconciliations r
   set status        = 'draft',
       review_due_at = now() + make_interval(
         mins => coalesce(
           (o.settings ->> 'review_window_minutes')::integer,
           coalesce((o.settings ->> 'review_window_hours')::integer, 24) * 60
         )
       )
  from organizations o
 where o.id = r.org_id
   and r.status = 'skipped'
   and r.responded;
