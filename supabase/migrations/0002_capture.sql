-- ============================================================================
-- NEXUS 0002 — Capture layer
--
-- One rule governs this whole file: THE RAW TEXT IS SACRED.
--
-- check_ins.raw_text is exactly what the human wrote, forever, and nothing in
-- the system is permitted to rewrite it. Every commitment, status change and
-- score is *derived* from it. That single constraint buys three things:
--
--   1. Extraction is re-runnable. Better model next quarter? Re-parse eight
--      weeks of history and compare, without having lost the source.
--   2. Provenance is real. When the UI says "you said this", it can quote the
--      actual sentence rather than a model's paraphrase of it.
--   3. Disputes are settleable. "I never said that" is answerable.
-- ============================================================================

create type checkin_channel as enum ('in_app', 'email', 'whatsapp', 'slack', 'teams', 'seed');

create type checkin_status as enum (
  'pending',    -- scheduled, not yet sent
  'prompted',   -- we asked, awaiting a human
  'responded',  -- human replied, not yet parsed
  'parsed',     -- extraction completed
  'skipped',    -- window closed with no reply
  'failed'      -- extraction errored; raw_text still intact, safe to retry
);

create table check_ins (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  profile_id        uuid not null references profiles(id) on delete cascade,

  -- The cycle being *reported on*. Commitments made during this check-in
  -- normally target cycle+1; see commitments.target_cycle_id in 0003.
  cycle_id          uuid not null references cycles(id) on delete cascade,

  channel           checkin_channel not null default 'in_app',
  status            checkin_status not null default 'pending',

  -- Immutable human authorship. Guarded by a trigger below.
  raw_text          text,

  -- Full conversation for multi-turn channels: [{role, content, at}, ...].
  -- The assistant's questions live here; raw_text holds only what the human
  -- authored, because that is all the extractor is ever allowed to read.
  transcript        jsonb not null default '[]'::jsonb,

  -- Untouched provider payload (inbound email headers, Slack event, ...) kept
  -- for debugging channel-specific parsing failures.
  raw_payload       jsonb,

  -- Opaque token embedded in the reply-to address so an inbound email maps
  -- back to exactly one check-in without trusting the From: header, which is
  -- trivially spoofed.
  reply_token       text unique,

  prompted_at       timestamptz,
  responded_at      timestamptz,
  parsed_at         timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- One scheduled check-in per person per cycle per channel.
  unique (profile_id, cycle_id, channel)
);

create index check_ins_profile_cycle_idx on check_ins (profile_id, cycle_id);
create index check_ins_org_cycle_idx on check_ins (org_id, cycle_id);
create index check_ins_status_idx on check_ins (status) where status in ('pending', 'prompted', 'responded');
create index check_ins_reply_token_idx on check_ins (reply_token) where reply_token is not null;

create trigger check_ins_updated_at
  before update on check_ins
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Enforce the immutability of raw_text.
--
-- Appending is allowed (a second email reply in the same window continues the
-- thread); rewriting or erasing history is not. This is a guard rail against
-- a future careless UPDATE, not against a determined admin.
-- ---------------------------------------------------------------------------

create or replace function guard_raw_text()
returns trigger
language plpgsql
as $$
begin
  if old.raw_text is not null
     and new.raw_text is distinct from old.raw_text
     and position(old.raw_text in coalesce(new.raw_text, '')) <> 1 then
    raise exception
      'check_ins.raw_text is append-only (check_in %). Derive from it; never overwrite it.',
      old.id;
  end if;
  return new;
end;
$$;

create trigger check_ins_guard_raw_text
  before update on check_ins
  for each row execute function guard_raw_text();
