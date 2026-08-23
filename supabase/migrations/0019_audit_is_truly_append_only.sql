-- ============================================================================
-- NEXUS 0019 — The audit log is append-only at the PRIVILEGE level too
--
-- 0016 said "read-only by construction": there is a select policy and an insert
-- policy and none for update or delete, and RLS denies what it does not permit.
-- That is true, and it is not the whole truth.
--
-- WHAT VERIFYING THE LIVE DATABASE ACTUALLY SHOWED
--
-- Supabase configures ALTER DEFAULT PRIVILEGES so that `authenticated` receives
-- every table privilege on anything created in `public`. So after 0016 the role
-- held SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER on
-- audit_events — not the SELECT and INSERT the migration asked for. The grant in
-- 0016 was additive on top of a blanket default, and only load-bearing on a bare
-- Postgres that has no such default.
--
-- For UPDATE and DELETE this changes nothing in practice: with RLS enabled and no
-- policy permitting them, they match zero rows and silently do nothing. The
-- append-only property survives.
--
-- TRUNCATE IS THE ONE THAT DOES NOT.
--
-- TRUNCATE is not row-level. RLS never sees it — Postgres checks the privilege
-- and empties the table. A role holding TRUNCATE on audit_events can erase the
-- entire administrative history in one statement, whatever the policies say.
--
-- It is not reachable today: PostgREST does not expose TRUNCATE, and the
-- application only ever issues the parameterised statements it was written with.
-- But "unreachable through the doors we happen to have built" is a different
-- claim from "cannot happen", and the audit log is precisely the table whose
-- entire value rests on the stronger one.
--
-- So the privileges are narrowed to match what 0016 said. Defence in depth: the
-- policies remain the mechanism, and this removes the statement that could go
-- around them.
--
-- SAFE TO REPLAY. Revokes are idempotent, and the grant restates 0016's
-- intention rather than adding anything new.
-- ============================================================================

do $guard$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    return;
  end if;

  /*
   * Everything off, then the two that the policies actually use back on.
   * Revoking the specific unwanted privileges instead would leave whatever
   * future default privileges are added silently in place — starting from
   * nothing is the only version that stays correct.
   */
  revoke all on audit_events from authenticated;
  grant select, insert on audit_events to authenticated;
end;
$guard$;

/*
 * `anon` is the unauthenticated role. It has no business anywhere near the
 * administrative history, and the same default privileges would have handed it
 * the same statements.
 */
do $guard$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on audit_events from anon;
  end if;
end;
$guard$;

comment on table audit_events is
  'Administrative history. Append-only twice over: no update or delete policy, '
  'and no update, delete or truncate privilege. TRUNCATE matters because RLS '
  'never sees it — it is a table-level statement, and a policy cannot stop one.';
