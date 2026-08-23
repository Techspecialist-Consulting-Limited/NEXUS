-- ============================================================================
-- NEXUS 0005 — Intelligence layer
--
-- Four mechanisms live here, and together they are the honest answer to
-- "the AI gets smarter over time". There is no fine-tuning anywhere in this
-- product. "Smarter" means exactly:
--
--   1. calibration     deterministic SQL over your own history. "You run 1.4x
--                      optimistic on backend work" is a fact from a table, not
--                      a model's impression. This is the difference between
--                      insight and horoscope.
--   2. memory_entries  durable patterns retrieved into prompts at generation
--                      time, with expiry — a pattern true in March must be
--                      allowed to stop being true in August.
--   3. advice.feedback accepted advice becomes exemplars; dismissed advice is
--                      suppressed by pattern. THIS TABLE IS THE LEARNING LOOP.
--                      Without the feedback columns the system repeats the same
--                      unwanted suggestion forever and gets switched off.
--   4. ai_runs         every call's cost, so the unit economics are observable
--                      from day one rather than discovered on a bill.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ai_runs — cost & latency observability
-- ---------------------------------------------------------------------------

create type ai_job_kind as enum ('extract', 'reconcile', 'coach', 'synthesize', 'learn', 'embed');

create table ai_runs (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid references organizations(id) on delete cascade,

  job               ai_job_kind not null,
  provider          text not null,          -- 'azure-foundry' | 'mock' | ...
  model             text not null,

  subject_type      text,                   -- 'check_in' | 'reconciliation' | 'digest' | ...
  subject_id        uuid,

  prompt_tokens     integer,
  completion_tokens integer,
  cost_usd          numeric(10,6),
  latency_ms        integer,

  status            text not null default 'ok',   -- 'ok' | 'error'
  error             text,

  created_at        timestamptz not null default now()
);

create index ai_runs_org_created_idx on ai_runs (org_id, created_at desc);
create index ai_runs_job_idx on ai_runs (job, created_at desc);
create index ai_runs_subject_idx on ai_runs (subject_type, subject_id);

-- ---------------------------------------------------------------------------
-- calibration — deterministic per-person statistics
--
-- Recomputed weekly by the 'learn' job. weeks_observed exists so the UI can be
-- honest during cold start: "learning — 3 of 6 weeks" instead of a confident
-- number derived from three data points.
-- ---------------------------------------------------------------------------

create table calibration (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  profile_id          uuid not null references profiles(id) on delete cascade,

  window_weeks        smallint not null default 12,
  weeks_observed      smallint not null default 0,

  -- actual / estimated. >1 means optimistic (work takes longer than promised).
  estimation_bias     numeric(6,3),
  avg_delivery_rate   numeric(5,2),
  avg_signal_integrity numeric(5,2),
  avg_carryover       numeric(5,2),
  max_carry_chain     smallint,
  avg_commitments_per_cycle numeric(5,2),

  -- Bias broken out by category: {"backend": 1.41, "design": 0.98, ...}
  category_bias       jsonb not null default '{}'::jsonb,

  -- Deliverables per weekday historically completed, for load-shaping advice.
  weekday_throughput  jsonb not null default '{}'::jsonb,

  computed_at         timestamptz not null default now(),

  unique (profile_id)
);

create index calibration_org_idx on calibration (org_id);

-- ---------------------------------------------------------------------------
-- memory_entries — retrieved context (pgvector)
-- ---------------------------------------------------------------------------

create type memory_scope as enum ('profile', 'department', 'org');
create type memory_kind  as enum ('pattern', 'preference', 'fact', 'bias', 'relationship');

create table memory_entries (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,

  scope           memory_scope not null,
  scope_id        uuid not null,            -- profile_id | department_id | org_id

  kind            memory_kind not null,
  content         text not null,            -- one durable statement, written for a prompt
  embedding       vector(1536),

  confidence      numeric(4,3) check (confidence between 0 and 1),
  source_ref      jsonb not null default '{}'::jsonb,

  -- Memories expire. A pattern that was true in March must be allowed to stop
  -- being true, otherwise the system confidently coaches from stale evidence.
  valid_from      timestamptz not null default now(),
  valid_until     timestamptz,
  superseded_by   uuid references memory_entries(id) on delete set null,

  created_at      timestamptz not null default now()
);

create index memory_scope_idx on memory_entries (scope, scope_id)
  where superseded_by is null;
create index memory_embedding_idx
  on memory_entries using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);

-- ---------------------------------------------------------------------------
-- advice — prescriptive output WITH a feedback loop
-- ---------------------------------------------------------------------------

create type advice_audience as enum ('employee', 'lead', 'executive');

create type advice_kind as enum (
  'nudge',              -- small, immediate, employee-facing
  'coaching',           -- how to work better toward a stated goal
  'load_warning',       -- calibration says this week is over-committed
  'dependency_alert',   -- someone is blocking someone
  'leadership_action',  -- a specific thing for an executive to say or decide
  'recognition'         -- something genuinely good, surfaced on purpose
);

create type advice_feedback as enum ('accepted', 'dismissed', 'edited', 'snoozed');

create table advice (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,

  audience          advice_audience not null,
  kind              advice_kind not null,

  -- who it is FOR, and who it is ABOUT (often different: an executive is told
  -- something about a member of staff)
  recipient_profile_id uuid references profiles(id) on delete cascade,
  subject_profile_id   uuid references profiles(id) on delete set null,
  subject_department_id uuid references departments(id) on delete set null,
  cycle_id          uuid references cycles(id) on delete set null,

  title             text not null,
  body              text not null,
  rationale         text,             -- why the system believes this
  suggested_action  text,             -- the concrete thing to do or say

  -- Evidence references: [{type:'commitment', id:'...', quote:'...'}, ...]
  -- Every factual claim in `body` must be traceable through here. The UI
  -- renders these as hoverable chips, which does more for adoption than any
  -- animation in this codebase.
  evidence_refs     jsonb not null default '[]'::jsonb,

  priority          smallint not null default 2 check (priority between 0 and 3),
  due_by            date,

  -- ---- the learning loop ----
  feedback          advice_feedback,
  feedback_note     text,
  feedback_at       timestamptz,
  edited_body       text,             -- what the human changed it to; the best training signal we get

  -- Stable hash of (kind, subject, shape) used to suppress advice the user has
  -- already dismissed. Without this the system nags identically forever.
  pattern_key       text,

  generated_by      text,
  cost_usd          numeric(10,6),
  created_at        timestamptz not null default now()
);

create index advice_recipient_idx on advice (recipient_profile_id, created_at desc);
create index advice_subject_idx on advice (subject_profile_id, created_at desc);
create index advice_pending_idx on advice (recipient_profile_id, priority desc)
  where feedback is null;
create index advice_pattern_idx on advice (pattern_key) where pattern_key is not null;

-- ---------------------------------------------------------------------------
-- digests
-- ---------------------------------------------------------------------------

create type digest_scope  as enum ('individual', 'department', 'executive');
create type digest_period as enum ('daily', 'weekly', 'monthly');
create type digest_status as enum ('queued', 'generated', 'sent', 'failed');

create table digests (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,

  scope           digest_scope not null,
  scope_id        uuid,                       -- profile_id | department_id | null for org
  period          digest_period not null,
  cycle_id        uuid references cycles(id) on delete set null,

  status          digest_status not null default 'queued',

  subject         text,
  -- Structured first, rendered second. The email template reads summary_json;
  -- html is a derived artifact. That ordering keeps the same briefing usable
  -- in the web UI, in email, and (later) in Slack without regenerating it.
  summary_json    jsonb not null default '{}'::jsonb,
  html            text,

  recipients      text[] not null default '{}',
  sent_at         timestamptz,
  error           text,

  model           text,
  cost_usd        numeric(10,6),
  created_at      timestamptz not null default now(),

  unique (org_id, scope, scope_id, period, cycle_id)
);

create index digests_org_status_idx on digests (org_id, status);

-- ---------------------------------------------------------------------------
-- notifications — with a hard budget
--
-- "Proactive" without a budget is spam, and a spammy assistant is muted in
-- week two, after which none of the rest of this system matters. Suppression
-- is recorded rather than silent so the thresholds can be tuned from evidence.
-- ---------------------------------------------------------------------------

create type notification_status as enum ('queued', 'sent', 'read', 'suppressed', 'failed');

create table notifications (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  profile_id        uuid not null references profiles(id) on delete cascade,

  kind              text not null,
  title             text not null,
  body              text,
  action_url        text,
  action_label      text,

  -- 0 = critical (always delivered, ignores budget and quiet hours)
  -- 1 = high, 2 = normal, 3 = low (first to be dropped)
  priority          smallint not null default 2 check (priority between 0 and 3),
  channel           text not null default 'in_app',

  advice_id         uuid references advice(id) on delete set null,

  status            notification_status not null default 'queued',
  suppressed_reason text,

  scheduled_for     timestamptz not null default now(),
  sent_at           timestamptz,
  read_at           timestamptz,

  created_at        timestamptz not null default now()
);

create index notifications_profile_idx on notifications (profile_id, created_at desc);
create index notifications_due_idx on notifications (scheduled_for)
  where status = 'queued';
create index notifications_unread_idx on notifications (profile_id)
  where status = 'sent' and read_at is null;

-- ---------------------------------------------------------------------------
-- enqueue_notification — the single door into the notification system.
--
-- Nothing else may INSERT into notifications directly. Every rule about
-- volume, timing and respect for the recipient's attention is enforced in
-- exactly one place, which is the only way such rules survive contact with a
-- growing codebase.
-- ---------------------------------------------------------------------------

create or replace function enqueue_notification(
  p_profile_id  uuid,
  p_kind        text,
  p_title       text,
  p_body        text default null,
  p_priority    smallint default 2,
  p_action_url  text default null,
  p_action_label text default null,
  p_advice_id   uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_org_id      uuid;
  v_tz          text;
  v_qs          smallint;
  v_qe          smallint;
  v_prefs       jsonb;
  v_max_nudges  integer;
  v_sent_today  integer;
  v_local_hour  integer;
  v_in_quiet    boolean;
  v_status      notification_status := 'queued';
  v_reason      text;
  v_scheduled   timestamptz := now();
  v_id          uuid;
begin
  select p.org_id, p.timezone, p.quiet_hours_start, p.quiet_hours_end, p.notification_prefs
    into v_org_id, v_tz, v_qs, v_qe, v_prefs
  from profiles p where p.id = p_profile_id;

  if v_org_id is null then
    raise exception 'enqueue_notification: unknown profile %', p_profile_id;
  end if;

  select coalesce((settings ->> 'max_nudges_per_day')::integer, 2)
    into v_max_nudges
  from organizations where id = v_org_id;

  -- Opted out of this class entirely.
  if p_kind = 'nudge' and coalesce((v_prefs ->> 'nudges')::boolean, true) = false then
    v_status := 'suppressed';
    v_reason := 'recipient has nudges disabled';
  end if;

  -- Daily budget. Critical (0) is exempt: a genuine escalation must never be
  -- silently eaten by a quota.
  --
  -- Counts anything already QUEUED as well as delivered. Counting only what
  -- has been sent would let a burst of ten enqueues all land in the queue
  -- together, pass the check individually, and then deliver as ten
  -- notifications — the budget defeated by concurrency.
  if v_status = 'queued' and p_priority > 0 then
    select count(*) into v_sent_today
    from notifications n
    where n.profile_id = p_profile_id
      and n.status in ('queued', 'sent', 'read')
      and n.priority > 0
      and n.created_at >= date_trunc('day', now() at time zone v_tz) at time zone v_tz;

    if v_sent_today >= v_max_nudges then
      v_status := 'suppressed';
      v_reason := format('daily budget reached (%s/%s)', v_sent_today, v_max_nudges);
    end if;
  end if;

  -- Quiet hours: hold, never discard. Handles windows that cross midnight.
  if v_status = 'queued' and p_priority > 0 then
    v_local_hour := extract(hour from (now() at time zone v_tz))::integer;
    v_in_quiet := case
                    when v_qs = v_qe then false
                    when v_qs <  v_qe then v_local_hour >= v_qs and v_local_hour < v_qe
                    else v_local_hour >= v_qs or v_local_hour < v_qe
                  end;
    if v_in_quiet then
      v_scheduled := (date_trunc('day', now() at time zone v_tz)
                      + make_interval(hours => v_qe)) at time zone v_tz;
      if v_scheduled <= now() then
        v_scheduled := v_scheduled + interval '1 day';
      end if;
    end if;
  end if;

  insert into notifications (
    org_id, profile_id, kind, title, body, priority,
    action_url, action_label, advice_id,
    status, suppressed_reason, scheduled_for
  )
  values (
    v_org_id, p_profile_id, p_kind, p_title, p_body, p_priority,
    p_action_url, p_action_label, p_advice_id,
    v_status, v_reason, v_scheduled
  )
  returning id into v_id;

  return v_id;
end;
$$;
