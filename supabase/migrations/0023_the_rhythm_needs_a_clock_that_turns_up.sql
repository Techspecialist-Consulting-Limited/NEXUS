-- ============================================================================
-- 0023 — the rhythm needs a clock that actually turns up
--
-- WHAT WENT WRONG.
--
-- The reporting rhythm is driven by POST /api/cron/tick, and the only thing
-- calling it was a GitHub Actions workflow set to `*/5 * * * *`. That is 288
-- ticks a day. GitHub delivered these, measured from its own API:
--
--     31 Aug   2      27 Aug   2
--     30 Aug   6      26 Aug  17
--     29 Aug   6      25 Aug  23
--     28 Aug   3      24 Aug  10
--
-- On Sunday 30 August the ticks landed at 01:29, 07:18, 13:00, 17:22, 19:56
-- and 22:35 UTC. An administrator queued a one-off brief at 08:31 UTC for
-- 08:41. The gate opened on time and the brief went out at 13:00:46 — four
-- hours and nineteen minutes late, because nothing asked between 07:18 and
-- 13:00.
--
-- Nothing in the application was wrong. `digestDue` returned true the first
-- time it was asked after the requested moment, which is exactly its
-- contract. The schedule was a request GitHub did not honour: scheduled
-- workflows run best-effort on a shared pool and are dropped or coalesced
-- under load, heavily so on free public-repo minutes. A product whose
-- Reporting page offers "send the brief in ten minutes" cannot be built on
-- a clock that turns up eight times a day.
--
-- WHAT THIS DOES.
--
-- Moves the clock into the database the product already depends on. pg_cron
-- runs inside Postgres on a schedule Postgres keeps, and pg_net makes the
-- HTTP call. No third party holds the secret, no account can lapse, and every
-- five minutes actually means every five minutes: measured over its first
-- hour, pg_cron fired at :00 of every single minute it was asked to.
--
-- WHY FIVE MINUTES AND NOT ONE. This was scheduled every minute first, and
-- pg_net's queue grew instead of draining. One tick takes about two minutes on
-- a live organisation — it reconciles, may call a model to narrate, then
-- briefs — so a one-minute schedule laps itself and backs up. Five minutes is
-- comfortably longer than the work, and it is the floor the Reporting page
-- already promises: "anything down to five minutes, that is how often the
-- scheduler checks".
--
-- GitHub Actions stays as a backstop. Two schedulers cannot double-send:
-- every job behind the tick is idempotent, and the gates ask "has this moment
-- passed and has nothing gone out since", never "is it exactly now".
--
-- WHAT YOU MUST DO ONCE, BY HAND.
--
-- The two values below are secrets and do not belong in a migration. Run this
-- in the Supabase SQL editor, once, with your real values:
--
--     select vault.create_secret(
--       'https://nexus-rose-theta-50.vercel.app', 'nexus_app_url',
--       'Base URL the rhythm tick is sent to');
--     select vault.create_secret(
--       '<the CRON_SECRET from Vercel>', 'nexus_cron_secret',
--       'Shared secret for POST /api/cron/tick');
--
-- Until they exist, nexus_rhythm_tick() does nothing and says so in the log.
-- It never raises: a scheduled job that fails every time is a job somebody
-- disables.
--
-- TO CHECK IT IS WORKING:
--
--     select d.status, d.start_time
--       from cron.job_run_details d
--       join cron.job j on j.jobid = d.jobid
--      where j.jobname = 'nexus-rhythm'
--      order by d.start_time desc limit 20;
--
--     select status_code, error_msg, created
--       from net._http_response order by created desc limit 20;
--
-- IF pg_cron SAYS "succeeded" BUT NOTHING ARRIVES, the pg_net background
-- worker is not draining its queue — a known state on a freshly installed
-- extension. Run this once:
--
--     select net.worker_restart();
--
-- and confirm with `select count(*) from net.http_request_queue`, which should
-- fall back to zero between ticks rather than climbing.
--
-- REPLAYABLE AGAINST A BARE POSTGRES. Everything is guarded on the extension
-- being available, so PGlite — which has neither pg_cron nor pg_net — applies
-- this as a no-op rather than failing the local suite.
-- ============================================================================

do $rhythm$
declare
  has_cron boolean;
  has_net  boolean;
begin
  select exists (select 1 from pg_available_extensions where name = 'pg_cron')
    into has_cron;
  select exists (select 1 from pg_available_extensions where name = 'pg_net')
    into has_net;

  if not (has_cron and has_net) then
    raise notice
      '[nexus] pg_cron/pg_net unavailable here; skipping the rhythm schedule. '
      'This is expected on PGlite and on a bare Postgres.';
    return;
  end if;

  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  -- ------------------------------------------------------------------------
  -- The tick itself.
  --
  -- SECURITY DEFINER so the scheduled job can read the Vault view without
  -- pg_cron's role being granted access to every secret in it. search_path is
  -- pinned for the same reason it is pinned on every other definer function in
  -- this schema: a definer function with a mutable search_path is a way to run
  -- somebody else's code as its owner.
  -- ------------------------------------------------------------------------
  create or replace function public.nexus_rhythm_tick()
  returns void
  language plpgsql
  security definer
  set search_path = public, net, vault, pg_temp
  as $fn$
  declare
    app_url text;
    secret  text;
  begin
    select decrypted_secret into app_url
      from vault.decrypted_secrets where name = 'nexus_app_url';
    select decrypted_secret into secret
      from vault.decrypted_secrets where name = 'nexus_cron_secret';

    /*
     * Missing configuration is not an error worth raising.
     *
     * This runs every five minutes forever. A job that throws every time
     * fills cron.job_run_details with noise and gets switched off by whoever
     * is reading it, which would put us back where we started.
     */
    if app_url is null or secret is null then
      raise notice
        '[nexus] rhythm tick skipped: create the nexus_app_url and '
        'nexus_cron_secret Vault secrets (see migration 0023).';
      return;
    end if;

    perform net.http_post(
      url     := rtrim(app_url, '/') || '/api/cron/tick',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || secret
                 ),
      body    := '{}'::jsonb,
      -- Long enough for the whole chain: reconcile, narrate (which may call a
      -- model), digest, send. Measured at roughly two minutes on a live
      -- organisation, so this is that with room. pg_net does not block on the
      -- response; this only bounds how long it waits before recording a
      -- timeout, which shows up as a null status_code in net._http_response.
      timeout_milliseconds := 240000
    );
  end;
  $fn$;

  comment on function public.nexus_rhythm_tick() is
    'Asks the application to run the reporting rhythm. Scheduled by pg_cron '
    'every five minutes; see migration 0023 for why the GitHub Action was not '
    'enough.';

  -- Only the scheduler needs it. Nothing in the app calls this.
  revoke all on function public.nexus_rhythm_tick() from public;

  -- ------------------------------------------------------------------------
  -- The schedule. Unscheduled first so this migration is replayable — cron
  -- .schedule on an existing name updates it, but an older name would linger.
  -- ------------------------------------------------------------------------
  if exists (select 1 from cron.job where jobname = 'nexus-rhythm') then
    perform cron.unschedule('nexus-rhythm');
  end if;

  perform cron.schedule(
    'nexus-rhythm',
    /*
     * Every five minutes, matching the floor the Reporting page offers.
     *
     * Not every minute: a tick takes about two minutes against a live
     * organisation, so a one-minute schedule laps itself and pg_net's queue
     * grows without ever draining. Measured, not assumed — the first attempt
     * at this was '* * * * *' and the queue went 1, 2, 4.
     */
    '*/5 * * * *',
    'select public.nexus_rhythm_tick()'
  );

  raise notice '[nexus] rhythm scheduled: nexus-rhythm, every five minutes.';
end;
$rhythm$;
