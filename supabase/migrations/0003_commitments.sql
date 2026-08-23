-- ============================================================================
-- NEXUS 0003 — Commitments, audit trail, evidence
--
-- A Commitment is NOT a task. A task is something someone typed into a form.
-- A commitment is a promise a human made in their own words, and it carries
-- the sentence that proves they made it (source_quote). That distinction is
-- the entire product: you cannot reconcile a promise you cannot quote back.
--
-- The other load-bearing idea here is `deviation_declared`. A commitment that
-- ends as 'deferred' because the person said on Tuesday "this is slipping, the
-- client moved the date" is a GOOD outcome — the org learned in time to react.
-- The same commitment ending as 'deferred' discovered by the system on Friday
-- is a bad outcome. Identical end state, opposite signal. Scoring in 0004
-- reads this column, and it is why NEXUS coaches rather than polices.
-- ============================================================================

create type commitment_status as enum (
  'promised',     -- stated, not yet started
  'in_progress',
  'delivered',    -- landed in full
  'partial',      -- some of it landed
  'deferred',     -- consciously moved to a later cycle
  'blocked',      -- cannot proceed; see blocker_kind
  'dropped',      -- abandoned
  'superseded'    -- replaced by a different commitment (see superseded_by_id)
);

create type commitment_priority as enum ('critical', 'high', 'normal', 'low');

create type blocker_kind as enum (
  'none',
  'external_team',    -- another department in this org
  'external_party',   -- client, vendor, regulator
  'capacity',         -- ran out of time/people
  'self',             -- own dependency, own fault
  'unknown'
);

-- ---------------------------------------------------------------------------
-- commitments
-- ---------------------------------------------------------------------------

create table commitments (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  profile_id          uuid not null references profiles(id) on delete cascade,
  department_id       uuid references departments(id) on delete set null,

  -- ---- provenance -------------------------------------------------------
  -- Every commitment must be traceable to the human utterance that created it.
  -- source_quote is a verbatim slice of check_ins.raw_text, never a paraphrase.
  source_check_in_id  uuid references check_ins(id) on delete set null,
  source_quote        text,
  extraction_confidence numeric(4,3) check (extraction_confidence between 0 and 1),

  -- ---- content ----------------------------------------------------------
  title               text not null,
  description         text,
  category            text,                                    -- free-form; clustered later
  priority            commitment_priority not null default 'normal',

  estimated_effort_hours numeric(6,2) check (estimated_effort_hours >= 0),
  actual_effort_hours    numeric(6,2) check (actual_effort_hours >= 0),

  -- ---- timing -----------------------------------------------------------
  created_cycle_id    uuid not null references cycles(id) on delete restrict,  -- promised IN
  target_cycle_id     uuid not null references cycles(id) on delete restrict,  -- promised FOR
  due_on              date,

  -- ---- lifecycle --------------------------------------------------------
  status              commitment_status not null default 'promised',
  outcome_reason      text,

  -- false when this work was never promised in advance — the reconciler found
  -- it in a report with no matching commitment. Unplanned work is not a sin
  -- (firefighting is real work), but a team running at 60% unplanned is a
  -- finding an executive needs, and no weekly-status tool surfaces it today.
  was_planned         boolean not null default true,

  -- True when the human proactively told us this was changing, BEFORE the
  -- cycle closed. The difference between a professional and a ghost.
  deviation_declared  boolean not null default false,
  declared_at         timestamptz,

  blocker_kind        blocker_kind not null default 'none',

  -- ---- graph ------------------------------------------------------------
  depends_on_commitment_id uuid references commitments(id) on delete set null,
  depends_on_department_id uuid references departments(id) on delete set null,

  -- Rollover chain. Following carried_from_commitment_id backwards gives the
  -- full slippage history: a 5-link chain is a commitment that has been
  -- "next week" for five weeks, which no weekly-snapshot tool can ever see.
  carried_from_commitment_id uuid references commitments(id) on delete set null,
  superseded_by_id           uuid references commitments(id) on delete set null,

  -- ---- matching ---------------------------------------------------------
  -- Cached embedding of (title || description). The reconciler compares this
  -- against reported outcomes so the cheap path costs no model call at all.
  embedding           vector(1536),

  delivered_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,

  constraint declared_needs_timestamp
    check (deviation_declared = false or declared_at is not null)
);

create index commitments_profile_target_idx  on commitments (profile_id, target_cycle_id) where deleted_at is null;
create index commitments_org_target_idx      on commitments (org_id, target_cycle_id)     where deleted_at is null;
create index commitments_department_idx      on commitments (department_id, target_cycle_id) where deleted_at is null;
create index commitments_status_idx          on commitments (status)                      where deleted_at is null;
create index commitments_source_checkin_idx  on commitments (source_check_in_id);
create index commitments_carried_from_idx    on commitments (carried_from_commitment_id) where carried_from_commitment_id is not null;
create index commitments_depends_dept_idx    on commitments (depends_on_department_id)   where depends_on_department_id is not null;

-- ANN index for the matcher. ivfflat needs rows before it pays off; the seed
-- creates enough. Cosine because embeddings are normalised.
create index commitments_embedding_idx
  on commitments using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create trigger commitments_updated_at
  before update on commitments
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- commitment_events — append-only audit trail
--
-- Every mutation lands here with its actor. When an executive asks "who
-- decided this was dropped, the person or the machine?", this table answers
-- without ambiguity. It is also how the UI renders a commitment's history.
-- ---------------------------------------------------------------------------

create type event_actor_kind as enum ('ai', 'human', 'system');

create table commitment_events (
  id              bigserial primary key,
  commitment_id   uuid not null references commitments(id) on delete cascade,

  event_type      text not null,   -- created | status_changed | edited | evidence_linked | carried_over | ...
  actor_kind      event_actor_kind not null,
  actor_profile_id uuid references profiles(id) on delete set null,
  actor_model     text,            -- populated when actor_kind = 'ai'

  from_status     commitment_status,
  to_status       commitment_status,
  payload         jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now()
);

create index commitment_events_commitment_idx on commitment_events (commitment_id, created_at desc);
create index commitment_events_type_idx on commitment_events (event_type, created_at desc);

-- ---------------------------------------------------------------------------
-- evidence
--
-- Deliberately abstract from day one. v1 populates only 'self_report' and
-- 'peer_mention', but GitHub commits, Jira transitions and calendar events are
-- the same shape: something that happened, at a time, with a URL and an
-- excerpt. Adding those connectors later must not require a migration.
--
-- 'peer_mention' is free corroboration: when someone else's check-in refers to
-- your work, that is third-party evidence at zero integration cost.
-- ---------------------------------------------------------------------------

create type evidence_kind as enum ('self_report', 'peer_mention', 'artifact', 'connector');

create table evidence (
  id              uuid primary key default gen_random_uuid(),
  commitment_id   uuid not null references commitments(id) on delete cascade,

  kind            evidence_kind not null,
  source          text not null,          -- 'check_in' | 'github' | 'jira' | 'calendar' | ...
  source_ref      text,                   -- external id, when there is one
  url             text,

  excerpt         text,
  occurred_at     timestamptz not null default now(),
  confidence      numeric(4,3) check (confidence between 0 and 1),

  -- Who/what asserted this. peer_mention carries the colleague's profile.
  asserted_by_profile_id uuid references profiles(id) on delete set null,

  created_at      timestamptz not null default now()
);

create index evidence_commitment_idx on evidence (commitment_id, occurred_at desc);
create index evidence_kind_idx on evidence (kind);
create unique index evidence_dedupe_idx
  on evidence (commitment_id, source, source_ref)
  where source_ref is not null;

-- ---------------------------------------------------------------------------
-- priority_weight — used by the scoring functions in 0004.
--
-- Kept as a function rather than inlined CASE statements so the weighting is
-- defined in exactly one place and can be tuned without hunting through views.
-- ---------------------------------------------------------------------------

create or replace function priority_weight(p commitment_priority)
returns numeric
language sql
immutable
as $$
  select case p
           when 'critical' then 3.0
           when 'high'     then 2.0
           when 'normal'   then 1.0
           when 'low'      then 0.5
         end::numeric;
$$;
