-- ============================================================================
-- NEXUS 0014 — Unit health covers weeks that have actually started
--
-- 0013 changed department_cycle_health to count PEOPLE rather than
-- reconciliation rows, which is what "people_reporting" always claimed to
-- mean. Correct, but it joined every cycle in the table — including ones that
-- have not begun. A row asserting "this unit has 3 people expected to report"
-- for a week three weeks in the future is not wrong so much as meaningless,
-- and it triples the size of any unfiltered read of the view.
--
-- Callers always filter by cycle_id, so this changes no screen. It keeps the
-- view honest about what it is: the weeks this organisation has actually run.
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
join cycles cy
  on cy.org_id = d.org_id
 and cy.starts_on <= current_date
/*
 * Who is EXPECTED to report. The Chairman and the IT admin file nothing, so
 * counting them would leave every unit permanently short by one — the same
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
  'Unit health per started week. people_reporting counts the people EXPECTED '
  'to report, not the reconciliation rows that happen to exist — counting rows '
  'made a unit where nobody filed disappear from the organisation view.';
