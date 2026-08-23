-- ============================================================================
-- NEXUS 0015 — The Administrator is a staff member too
--
-- One person. One identity. Capabilities on top.
--
-- NEXUS has five stored roles, and the interface had been treating them as
-- five kinds of person. They are not. An administrator is a staff member who
-- can also configure the organisation; a department lead is a staff member who
-- can also see their unit; HR is a staff member who also owns the reporting
-- rhythm. Only the Chairman is a genuinely different experience — he consumes
-- organisational intelligence and does not file a weekly standup.
--
-- The consequence in the data was small and specific: "who is expected to
-- report" was written as
--
--   p.role in ('staff', 'lead', 'hr')
--
-- which left the Administrator out. That produced an admin managing a
-- reporting rhythm they were personally exempt from — and, more concretely, an
-- admin who could never appear in a compliance figure however diligently they
-- filed, because the view that counts expected reporters did not count them.
--
-- Inverted to `p.role <> 'executive'`: everybody reports except the Chairman.
-- Stated as an exclusion rather than a list, so adding a role later does not
-- silently create another exempt seat.
--
-- SAFE TO REPLAY. Only a view definition changes. No table, column, policy,
-- index or row is touched, and no reconciliation is recomputed — an admin who
-- has not filed simply starts being counted as expected and not responded,
-- which is what "did not report" has always meant for everybody else.
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
 * Who is EXPECTED to report: everybody except the Chairman.
 *
 * Written as an exclusion rather than a list of included roles. A list is a
 * seat waiting to be forgotten — that is exactly how the Administrator ended
 * up exempt from the rhythm they configure.
 */
join profiles p
  on p.department_id = d.id
 and p.status = 'active'
 and p.role <> 'executive'
left join reconciliations r
  on r.profile_id = p.id
 and r.cycle_id = cy.id
group by d.id, d.org_id, d.name, d.color, cy.id;

comment on view department_cycle_health is
  'Unit health per started week. people_reporting counts the people EXPECTED '
  'to report — everybody but the Chairman — not the reconciliation rows that '
  'happen to exist.';

/*
 * DROP VIEW takes the grants with it, and CREATE VIEW does not bring them
 * back. Re-granted explicitly rather than relying on the connection's default
 * privileges, which differ between a Supabase project and a bare Postgres —
 * and a view that reads "permission denied" is indistinguishable from one that
 * returns nothing until somebody reads the log.
 */
do $grant$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on department_cycle_health to authenticated;
  end if;
end;
$grant$;
