-- ============================================================================
-- NEXUS 0013 — Unit health counts PEOPLE, not reconciliation rows
--
-- department_cycle_health was built as:
--
--   from reconciliations r
--   join profiles d_p on d_p.id = r.profile_id
--   ...
--   count(*) as people_reporting
--
-- so "people_reporting" actually meant "reconciliation rows that exist". Every
-- consequence of that runs the same direction: it makes non-reporting
-- invisible.
--
--   A unit where 1 of 5 filed reads "1/1 reported" — perfect compliance.
--   A unit where NOBODY filed produces no row at all, so the unit vanishes
--   from the executive's view of the organisation entirely.
--
-- That is the exact opposite of what this product exists to surface, and it
-- showed up as two numbers disagreeing on one screen: a lead's unit card said
-- "Reported 1/1" directly above a roster listing four people who had not
-- reported.
--
-- The fix is to count from PROFILES — the people expected to report — and left
-- join their reconciliations. Anyone with no row is now counted as expected and
-- not responded, which is what "did not report" means.
--
-- The view stays security_invoker, so it is still the reader's own policies
-- that decide which units and people they can see. Counting more honestly must
-- not mean showing more widely.
-- ============================================================================

drop view if exists department_cycle_health;

create view department_cycle_health
with (security_invoker = true)
as
select
  d.id                                     as department_id,
  d.org_id,
  d.name                                   as department_name,
  d.color,
  cy.id                                    as cycle_id,
  count(p.id)                              as people_reporting,
  count(*) filter (where r.responded)      as people_responded,
  round(avg(r.delivery_rate)    filter (where r.delivery_rate    is not null), 2) as delivery_rate,
  round(avg(r.signal_integrity) filter (where r.signal_integrity is not null), 2) as signal_integrity,
  round(avg(r.focus_ratio)      filter (where r.focus_ratio      is not null), 2) as focus_ratio,
  coalesce(sum(r.promised_count), 0)       as promised_count,
  coalesce(sum(r.delivered_count), 0)      as delivered_count,
  coalesce(sum(r.silent_drop_count), 0)    as silent_drop_count,
  coalesce(sum(r.carryover_count), 0)      as carryover_count,
  coalesce(sum(r.unplanned_count), 0)      as unplanned_count,
  coalesce(sum(r.protected_count), 0)      as protected_count
from departments d
join cycles cy on cy.org_id = d.org_id
/*
 * Who is EXPECTED to report. The Chairman and the IT admin file nothing, so
 * counting them would make every unit permanently short by one — the same
 * class of error in the other direction.
 */
join profiles p
  on p.department_id = d.id
 and p.status = 'active'
 and p.role in ('staff', 'lead', 'hr')
left join reconciliations r
  on r.profile_id = p.id
 and r.cycle_id = cy.id
group by d.id, d.org_id, d.name, d.color, cy.id;

comment on view department_cycle_health is
  'Unit health per cycle. people_reporting counts the people EXPECTED to '
  'report, not the reconciliation rows that happen to exist — counting rows '
  'made a unit where nobody filed disappear from the organisation view.';
