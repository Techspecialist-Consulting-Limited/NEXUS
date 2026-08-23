-- ============================================================================
-- NEXUS 0017 — Departments are archived, never deleted
--
-- A unit that has existed for a quarter is referenced by every commitment,
-- reconciliation, dependency edge and finding produced in that time. Deleting
-- it does one of two things, both bad: it cascades and takes the history with
-- it, or it nulls the foreign keys and leaves a quarter of reporting attached
-- to nothing. Either way the organisation loses the ability to answer "how did
-- Creative Hub do in March", permanently, because somebody tidied up.
--
-- So the destructive action is removed and replaced with `archived_at`. An
-- archived unit stops appearing in the places people pick a unit — assignment,
-- filters, the readiness count — and keeps appearing everywhere its history
-- does.
--
-- ALSO: the executive loses department write access.
--
-- 0006 granted `departments_write` to 'admin' and 'executive'. PRD F17 is
-- explicit that the Chairman's signed-in view "is read-only and carries no
-- administrative capability" — he reads the organisation, he does not
-- restructure it. That grant was the one place the policy set disagreed with
-- the product, and it disagreed silently because no interface ever offered him
-- the control.
--
-- SAFE TO REPLAY. Adds one nullable column and replaces one policy. No row is
-- modified: everything that exists is unarchived, which is what it already
-- was.
-- ============================================================================

alter table departments
  add column archived_at timestamptz;

comment on column departments.archived_at is
  'Set to retire a unit. Its historical reporting stays readable and attached; '
  'it simply stops being offered as a choice. There is no delete.';

create index departments_active_idx
  on departments (org_id)
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- Only the Administrator restructures the organisation
-- ---------------------------------------------------------------------------

drop policy if exists departments_write on departments;

create policy departments_write on departments
  for all using (org_id = current_org_id() and current_org_role() = 'admin')
  with check (org_id = current_org_id() and current_org_role() = 'admin');
