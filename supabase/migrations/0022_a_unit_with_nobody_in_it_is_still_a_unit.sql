-- ============================================================================
-- 0022 — a unit with nobody in it is still a unit
--
-- WHAT HAPPENED
--
-- Four units were created in Techspecialist Consulting Limited — Automation /
-- Engineering, Marketing & Communication, HR, Project Management — and the
-- organisation view showed none of them. Not "empty", not "0/0". Absent.
--
--   departments in the org                          : 4
--   department_cycle_health rows for the open cycle  : 0
--
-- Because the view INNER JOINS profiles. A unit nobody has been assigned to
-- contributes no rows to the join, so it disappears from every surface built on
-- this view: the Chairman's Units page, unit health, and the per-unit section of
-- the executive briefing.
--
-- That is the same class of error migration 0014 fixed one level down. Its own
-- comment says it plainly: "counting rows made a unit where nobody filed
-- disappear from the organisation view." Nobody FILING was fixed; nobody
-- BELONGING was not, and it is the more likely state — every unit passes
-- through it on the day it is created.
--
-- The effect on a new organisation is worse than a missing row. The first thing
-- an administrator does is create their units; the first thing they see is that
-- the units are not there. Nothing tells them the units exist and are empty, so
-- the reasonable conclusion is that creating them failed.
--
-- THE FIX
--
-- LEFT JOIN. A unit is a thing the organisation has decided exists, not a
-- by-product of somebody being assigned to it. With nobody in it the counts are
-- honestly zero and the rates are honestly null, which is what the interface
-- should be given the chance to say.
--
-- ARCHIVED UNITS ARE EXCLUDED, which migration 0017 already intended: "an
-- archived unit stops appearing in the places people pick a unit". Without this
-- the LEFT JOIN would newly surface retired empty units, which is the opposite
-- of what archiving is for.
--
-- No reporting history is lost by that exclusion. The organisation totals in
-- the executive briefing are counted from PROFILES and their reconciliations,
-- not from a roll-up of units, so a person in an archived unit still appears in
-- every figure and in the per-person view. Only the unit stops being listed as
-- a live unit, which is what archiving means.
--
-- SAFE TO REPLAY. Only a view definition changes. No table, column, policy,
-- index or row is touched.
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
  /*
   * count(p.id), not count(*).
   *
   * Load-bearing under a LEFT JOIN: with nobody in the unit the join still
   * produces one row carrying a null profile, and count(*) would report that
   * unit as having one expected reporter who never files. A unit would sit at
   * 0/1 forever, and every compliance figure above it would be wrong by one
   * per empty unit.
   */
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
 *
 * LEFT, so the unit survives having nobody in it. The role and status tests
 * belong in the ON clause rather than a WHERE for the same reason: in a WHERE
 * they would filter away the null-profile row and take the whole unit with it,
 * which is the inner join again wearing a different hat.
 */
left join profiles p
  on p.department_id = d.id
 and p.status = 'active'
 and p.role <> 'executive'
left join reconciliations r
  on r.profile_id = p.id
 and r.cycle_id = cy.id
where d.archived_at is null
group by d.id, d.org_id, d.name, d.color, cy.id;

comment on view department_cycle_health is
  'Unit health per started week. Every live unit appears, including one with '
  'nobody assigned to it yet — a unit is something the organisation decided '
  'exists, not a by-product of somebody being placed in it. people_reporting '
  'counts the people EXPECTED to report, everybody but the Chairman.';

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
