-- ============================================================================
-- NEXUS 0012 — Un-double-encode stored briefings
--
-- generateDigest wrote summary_json as:
--
--   ${JSON.stringify(payload)}::jsonb
--
-- postgres.js already serialises a JS object for a jsonb parameter, so passing
-- it a string stored the string ITSELF as a jsonb value — a scalar of type
-- string whose contents happen to be JSON text. The column is not corrupt and
-- nothing errored; `select summary_json` returns something that looks right in
-- a console.
--
-- What it broke is the read. Every consumer does summary.decisions, which on a
-- string is undefined — so the briefing rendered with a correct subject line
-- and an entirely empty body, and the send path marked it delivered. A silent
-- failure that reports success is the exact shape of bug this system exists to
-- prevent, and it went out to real recipients before it was caught.
--
-- jsonb_typeof tells the two apart precisely, so this repair is safe to run
-- more than once and does nothing to rows that were always correct.
-- ============================================================================

update digests
   set summary_json = (summary_json #>> '{}')::jsonb
 where jsonb_typeof(summary_json) = 'string'
   and (summary_json #>> '{}') like '{%';

-- Refuse the shape at the boundary rather than trusting every future writer to
-- remember. A briefing is an object; a scalar is a bug.
alter table digests
  drop constraint if exists digests_summary_is_object;

alter table digests
  add constraint digests_summary_is_object
  check (jsonb_typeof(summary_json) = 'object')
  not valid;

alter table digests validate constraint digests_summary_is_object;

comment on constraint digests_summary_is_object on digests is
  'summary_json must be an object. A JSON string here reads back as undefined '
  'on every field, which renders an empty briefing that still reports as sent.';
