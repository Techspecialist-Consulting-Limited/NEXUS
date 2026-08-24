-- ============================================================================
-- NEXUS demo seed — GENERATED FILE, do not edit by hand.
--   regenerate with:  npm run db:seed:generate
--
-- 8 weeks of history for 18 people across 5 departments,
-- carrying five planted narratives the reconciliation engine has to discover
-- on its own. See scripts/generate-seed.mjs for what is hidden in here and why.
--
-- Dates are relative to current_date, so this always reads as "the last eight
-- weeks" regardless of when it is applied. Safe to re-run: it clears its own
-- organisation first.
-- ============================================================================

do $seed$
declare
  v_org    uuid;
  v_anchor date;
  v_cid    uuid;
  -- NOT named "r": plpgsql substitutes declared variables into SQL text, and
  -- a record called r would collide with the "reconciliations r" alias used
  -- further down, failing with "column reference r.cycle_id is ambiguous".
  srow     record;
begin
  -- Monday of the week 8 weeks ago.
  v_anchor := (date_trunc('week', current_date) - interval '8 weeks')::date;

  -- Re-runnable. commitments reference cycles with ON DELETE RESTRICT, so a
  -- bare "delete from organizations" would race its own cascade; clear the
  -- restricted children explicitly first.
  delete from commitments c
   using profiles p, organizations o
   where c.profile_id = p.id and p.org_id = o.id and o.slug = 'nexus-demo';
  delete from organizations where slug = 'nexus-demo';

  insert into organizations (name, slug, timezone)
  values ('Nexus Demo Group', 'nexus-demo', 'Africa/Lagos')
  returning id into v_org;

  -- one cycle beyond today: a commitment made on Friday targets next week,
  -- which must already exist
  perform generate_cycles(v_org, 'week',  v_anchor, (current_date + interval '3 weeks')::date);
  perform generate_cycles(v_org, 'month', v_anchor, (current_date + interval '1 month')::date);

  -- ---- departments --------------------------------------------------------
  insert into departments (org_id, slug, name, color, description)
  select v_org, d.slug, d.name, d.color, d.description
  from (values
      ('techspecialist', 'Techspecialist', '#5B8CFF', 'Platform engineering, integrations and internal tooling.'),
      ('media-hub', 'Media Hub', '#F2789F', 'Production, editorial and channel distribution.'),
      ('creative-hub', 'Creative Hub', '#F5B942', 'Brand, design systems and campaign creative.'),
      ('operations', 'Operations', '#48C9A9', 'Delivery management, vendors and client onboarding.'),
      ('growth', 'Growth', '#B18CF5', 'Partnerships, pipeline and revenue programmes.')
  ) as d(slug, name, color, description);

  -- ---- people -------------------------------------------------------------
  insert into profiles (org_id, department_id, email, full_name, role, title)
  select
    v_org,
    dep.id,
    p.email,
    p.full_name,
    p.role::org_role,
    p.title
  from (values
      ('amara@nexus.demo', 'Amara Okonkwo', 'techspecialist', 'lead', 'Head of Engineering'),
      ('chidi@nexus.demo', 'Chidi Nwosu', 'techspecialist', 'staff', 'Senior Engineer'),
      ('zainab@nexus.demo', 'Zainab Yusuf', 'techspecialist', 'staff', 'Backend Engineer'),
      ('emeka@nexus.demo', 'Emeka Obi', 'techspecialist', 'staff', 'Data Engineer'),
      ('fatima@nexus.demo', 'Fatima Bello', 'techspecialist', 'staff', 'QA Engineer'),
      ('tunde@nexus.demo', 'Tunde Balogun', 'media-hub', 'lead', 'Head of Media'),
      ('ngozi@nexus.demo', 'Ngozi Eze', 'media-hub', 'staff', 'Producer'),
      ('yusuf@nexus.demo', 'Yusuf Ibrahim', 'media-hub', 'staff', 'Video Editor'),
      ('adaeze@nexus.demo', 'Adaeze Nnamdi', 'creative-hub', 'lead', 'Creative Director'),
      ('kelechi@nexus.demo', 'Kelechi Anyanwu', 'creative-hub', 'staff', 'Designer'),
      ('halima@nexus.demo', 'Halima Sani', 'creative-hub', 'staff', 'Copywriter'),
      ('segun@nexus.demo', 'Segun Adeyemi', 'operations', 'lead', 'Head of Operations'),
      ('blessing@nexus.demo', 'Blessing Okoro', 'operations', 'staff', 'Delivery Manager'),
      ('ifeoma@nexus.demo', 'Ifeoma Chukwu', 'growth', 'lead', 'Head of Growth'),
      ('musa@nexus.demo', 'Musa Danjuma', 'growth', 'staff', 'Partnerships Lead'),
      ('exec@nexus.demo', 'Damilola Ogunlesi', null, 'executive', 'Chairman'),
      ('hr@nexus.demo', 'Bisi Adewale', null, 'hr', 'Head of People'),
      ('admin@nexus.demo', 'Tolu Adebayo', null, 'admin', 'IT Administrator')
  ) as p(email, full_name, dept_slug, role, title)
  left join departments dep on dep.org_id = v_org and dep.slug = p.dept_slug;

  update departments d
  set lead_id = p.id
  from profiles p
  where p.org_id = v_org
    and p.department_id = d.id
    and p.role = 'lead'
    and d.org_id = v_org;

  -- ---- check-ins ----------------------------------------------------------
  insert into check_ins (
    org_id, profile_id, cycle_id, channel, status,
    raw_text, prompted_at, responded_at, parsed_at
  )
  select
    v_org,
    p.id,
    cy.id,
    'seed',
    'parsed',
    c.raw_text,
    (cy.ends_on - 1)::timestamptz + interval '15 hours',
    (cy.ends_on - 1)::timestamptz + interval '17 hours',
    (cy.ends_on - 1)::timestamptz + interval '17 hours'
  from (values
      ('amara@nexus.demo', 0, 'Shipped this week: Cut API p95 latency below 300ms; Add retry + backoff to the webhook dispatcher. Still in flight: Migrate the reporting pipeline to the new warehouse; Set up alerting for failed background jobs; Rotate the production credentials; Ship the commitment reconciliation endpoint; Rebuild the department drill-down view.'),
      ('amara@nexus.demo', 1, 'Shipped this week: Ship the commitment reconciliation endpoint; Add keyboard navigation to the commitment list; Move session storage off the primary database; Roll staging onto the new deployment pipeline; Rebuild the department drill-down view. Still in flight: Migrate the reporting pipeline to the new warehouse; Harden the inbound email parser against malformed MIME.'),
      ('amara@nexus.demo', 2, 'Shipped this week: Fix layout shift on the dashboard header; Add retry + backoff to the webhook dispatcher. Still in flight: Migrate the reporting pipeline to the new warehouse; Add keyboard navigation to the commitment list; Harden the inbound email parser against malformed MIME; Set up alerting for failed background jobs.'),
      ('amara@nexus.demo', 3, 'Shipped this week: Move session storage off the primary database; Set up alerting for failed background jobs; Rebuild the department drill-down view. Still in flight: Migrate the reporting pipeline to the new warehouse; Rotate the production credentials; Cut API p95 latency below 300ms; Add retry + backoff to the webhook dispatcher.'),
      ('amara@nexus.demo', 4, 'Shipped this week: Move session storage off the primary database; Add retry + backoff to the webhook dispatcher; Add keyboard navigation to the commitment list. Still in flight: Migrate the reporting pipeline to the new warehouse; Fix layout shift on the dashboard header; Roll staging onto the new deployment pipeline; Rebuild the department drill-down view.'),
      ('amara@nexus.demo', 5, 'Shipped this week: Move session storage off the primary database; Set up alerting for failed background jobs. Still in flight: Migrate the reporting pipeline to the new warehouse; Fix layout shift on the dashboard header; Cut API p95 latency below 300ms; Add keyboard navigation to the commitment list.'),
      ('amara@nexus.demo', 6, 'Shipped this week: Roll staging onto the new deployment pipeline; Add retry + backoff to the webhook dispatcher; Rebuild the department drill-down view. Still in flight: Migrate the reporting pipeline to the new warehouse; Ship the commitment reconciliation endpoint; Add keyboard navigation to the commitment list; Move session storage off the primary database.'),
      ('amara@nexus.demo', 7, 'Shipped this week: Migrate the reporting pipeline to the new warehouse. Still in flight: Ship the commitment reconciliation endpoint; Rotate the production credentials; Move session storage off the primary database; Roll staging onto the new deployment pipeline; Rebuild the department drill-down view; Fix layout shift on the dashboard header; Harden the inbound email parser against malformed MIME.'),
      ('chidi@nexus.demo', 0, 'Blocked on Integrate the new brand assets into the app shell; Ship the campaign landing page — waiting on Creative Hub to sign off. Still in flight: Cut API p95 latency below 300ms.'),
      ('chidi@nexus.demo', 2, 'Shipped this week: Add retry + backoff to the webhook dispatcher. Blocked on Integrate the new brand assets into the app shell; Ship the campaign landing page — waiting on Creative Hub to sign off.'),
      ('chidi@nexus.demo', 3, 'Shipped this week: Move session storage off the primary database; Add keyboard navigation to the commitment list. Blocked on Integrate the new brand assets into the app shell; Ship the campaign landing page — waiting on Creative Hub to sign off.'),
      ('chidi@nexus.demo', 4, 'Shipped this week: Fix layout shift on the dashboard header. Blocked on Integrate the new brand assets into the app shell; Ship the campaign landing page — waiting on Creative Hub to sign off. Still in flight: Ship the commitment reconciliation endpoint.'),
      ('chidi@nexus.demo', 5, 'Blocked on Integrate the new brand assets into the app shell; Ship the campaign landing page — waiting on Creative Hub to sign off. Still in flight: Rotate the production credentials.'),
      ('chidi@nexus.demo', 6, 'Shipped this week: Add keyboard navigation to the commitment list. Blocked on Integrate the new brand assets into the app shell; Ship the campaign landing page — waiting on Creative Hub to sign off.'),
      ('chidi@nexus.demo', 7, 'Shipped this week: Roll staging onto the new deployment pipeline. Blocked on Integrate the new brand assets into the app shell; Ship the campaign landing page — waiting on Creative Hub to sign off. Still in flight: Add keyboard navigation to the commitment list.'),
      ('zainab@nexus.demo', 0, 'Shipped this week: Ship the commitment reconciliation endpoint; Roll staging onto the new deployment pipeline; Set up alerting for failed background jobs. Still in flight: Fix layout shift on the dashboard header.'),
      ('zainab@nexus.demo', 1, 'Shipped this week: Rebuild the department drill-down view; Roll staging onto the new deployment pipeline; Rotate the production credentials; Harden the inbound email parser against malformed MIME. Still in flight: Move session storage off the primary database.'),
      ('zainab@nexus.demo', 2, 'Shipped this week: Rebuild the department drill-down view. Still in flight: Cut API p95 latency below 300ms; Rotate the production credentials; Roll staging onto the new deployment pipeline.'),
      ('zainab@nexus.demo', 3, 'Shipped this week: Ship the commitment reconciliation endpoint; Rotate the production credentials; Roll staging onto the new deployment pipeline. Still in flight: Add keyboard navigation to the commitment list; Fix layout shift on the dashboard header.'),
      ('zainab@nexus.demo', 4, 'Shipped this week: Ship the commitment reconciliation endpoint. Still in flight: Cut API p95 latency below 300ms; Rotate the production credentials.'),
      ('zainab@nexus.demo', 5, 'Shipped this week: Fix layout shift on the dashboard header; Cut API p95 latency below 300ms; Ship the commitment reconciliation endpoint. Still in flight: Rotate the production credentials.'),
      ('zainab@nexus.demo', 6, 'Shipped this week: Add keyboard navigation to the commitment list; Ship the commitment reconciliation endpoint; Rotate the production credentials; Roll staging onto the new deployment pipeline.'),
      ('zainab@nexus.demo', 7, 'Shipped this week: Roll staging onto the new deployment pipeline; Fix layout shift on the dashboard header; Ship the commitment reconciliation endpoint. Still in flight: Set up alerting for failed background jobs.'),
      ('emeka@nexus.demo', 0, 'Shipped this week: Ship the commitment reconciliation endpoint; Rotate the production credentials. Still in flight: Cut API p95 latency below 300ms.'),
      ('emeka@nexus.demo', 1, 'Shipped this week: Rotate the production credentials; Rebuild the department drill-down view; Add keyboard navigation to the commitment list; Ship the commitment reconciliation endpoint.'),
      ('emeka@nexus.demo', 2, 'Shipped this week: Ship the commitment reconciliation endpoint; Cut API p95 latency below 300ms; Add keyboard navigation to the commitment list. Still in flight: Rotate the production credentials; Rebuild the department drill-down view.'),
      ('emeka@nexus.demo', 3, 'Shipped this week: Move session storage off the primary database; Add retry + backoff to the webhook dispatcher; Rebuild the department drill-down view; Fix layout shift on the dashboard header. Still in flight: Add keyboard navigation to the commitment list.'),
      ('emeka@nexus.demo', 4, 'Shipped this week: Fix layout shift on the dashboard header. Still in flight: Set up alerting for failed background jobs; Rotate the production credentials; Move session storage off the primary database.'),
      ('emeka@nexus.demo', 6, 'Shipped this week: Cut API p95 latency below 300ms; Roll staging onto the new deployment pipeline. Still in flight: Add keyboard navigation to the commitment list; Add retry + backoff to the webhook dispatcher.'),
      ('emeka@nexus.demo', 7, 'Shipped this week: Cut API p95 latency below 300ms; Fix layout shift on the dashboard header; Harden the inbound email parser against malformed MIME.'),
      ('fatima@nexus.demo', 0, 'Shipped this week: Add retry + backoff to the webhook dispatcher. Still in flight: Roll staging onto the new deployment pipeline; Move session storage off the primary database.'),
      ('fatima@nexus.demo', 1, 'Shipped this week: Move session storage off the primary database; Cut API p95 latency below 300ms; Roll staging onto the new deployment pipeline. Still in flight: Rebuild the department drill-down view.'),
      ('fatima@nexus.demo', 2, 'Shipped this week: Rebuild the department drill-down view; Roll staging onto the new deployment pipeline; Add keyboard navigation to the commitment list; Ship the commitment reconciliation endpoint.'),
      ('fatima@nexus.demo', 3, 'Shipped this week: Rotate the production credentials; Add keyboard navigation to the commitment list; Move session storage off the primary database; Cut API p95 latency below 300ms. Still in flight: Add retry + backoff to the webhook dispatcher.'),
      ('fatima@nexus.demo', 4, 'Shipped this week: Fix layout shift on the dashboard header; Roll staging onto the new deployment pipeline. Still in flight: Add keyboard navigation to the commitment list.'),
      ('fatima@nexus.demo', 5, 'Still in flight: Harden the inbound email parser against malformed MIME; Fix layout shift on the dashboard header; Set up alerting for failed background jobs.'),
      ('fatima@nexus.demo', 6, 'Shipped this week: Fix layout shift on the dashboard header. Still in flight: Rebuild the department drill-down view; Add retry + backoff to the webhook dispatcher; Set up alerting for failed background jobs.'),
      ('fatima@nexus.demo', 7, 'Shipped this week: Ship the commitment reconciliation endpoint; Rebuild the department drill-down view. Still in flight: Add retry + backoff to the webhook dispatcher.'),
      ('tunde@nexus.demo', 0, 'Shipped this week: Draft five channel scripts for the product launch. Still in flight: Cut the Q3 client showreel; Record and edit three founder interviews.'),
      ('tunde@nexus.demo', 1, 'Still in flight: Draft five channel scripts for the product launch; Cut the Q3 client showreel; Close out captions and subtitles for the archive.'),
      ('tunde@nexus.demo', 2, 'Shipped this week: Rebuild the podcast publishing checklist; Deliver the campaign launch film. Still in flight: Draft five channel scripts for the product launch.'),
      ('tunde@nexus.demo', 3, 'Shipped this week: Deliver the campaign launch film. Still in flight: Rebuild the podcast publishing checklist.'),
      ('tunde@nexus.demo', 4, 'Shipped this week: Record and edit three founder interviews; Publish the September editorial calendar; Cut the Q3 client showreel.'),
      ('tunde@nexus.demo', 5, 'Shipped this week: Deliver the campaign launch film. Still in flight: Publish the September editorial calendar; Draft five channel scripts for the product launch.'),
      ('tunde@nexus.demo', 6, 'Shipped this week: Publish the September editorial calendar. Still in flight: Rebuild the podcast publishing checklist.'),
      ('tunde@nexus.demo', 7, 'Shipped this week: Draft five channel scripts for the product launch. Still in flight: Publish the September editorial calendar; Rebuild the podcast publishing checklist.'),
      ('ngozi@nexus.demo', 0, 'Shipped this week: Record and edit three founder interviews; Cut the Q3 client showreel. Still in flight: Publish the September editorial calendar.'),
      ('ngozi@nexus.demo', 1, 'Shipped this week: Draft five channel scripts for the product launch; Deliver the campaign launch film; Rebuild the podcast publishing checklist. Still in flight: Record and edit three founder interviews.'),
      ('ngozi@nexus.demo', 2, 'Shipped this week: Record and edit three founder interviews; Rebuild the podcast publishing checklist; Publish the September editorial calendar.'),
      ('ngozi@nexus.demo', 3, 'Shipped this week: Record and edit three founder interviews; Deliver the campaign launch film. Still in flight: Draft five channel scripts for the product launch.'),
      ('ngozi@nexus.demo', 4, 'Shipped this week: Cut the Q3 client showreel; Rebuild the podcast publishing checklist; Deliver the campaign launch film; Draft five channel scripts for the product launch.'),
      ('ngozi@nexus.demo', 5, 'Shipped this week: Publish the September editorial calendar; Cut the Q3 client showreel; Deliver the campaign launch film.'),
      ('ngozi@nexus.demo', 6, 'Shipped this week: Close out captions and subtitles for the archive; Record and edit three founder interviews. Still in flight: Publish the September editorial calendar; Draft five channel scripts for the product launch.'),
      ('ngozi@nexus.demo', 7, 'Shipped this week: Close out captions and subtitles for the archive; Rebuild the podcast publishing checklist; Cut the Q3 client showreel; Publish the September editorial calendar.'),
      ('yusuf@nexus.demo', 0, 'Shipped this week: Record and edit three founder interviews; Rebuild the podcast publishing checklist. Still in flight: Publish the September editorial calendar; Cut the Q3 client showreel.'),
      ('yusuf@nexus.demo', 2, 'Shipped this week: Record and edit three founder interviews. Still in flight: Deliver the campaign launch film; Draft five channel scripts for the product launch.'),
      ('yusuf@nexus.demo', 3, 'Shipped this week: Record and edit three founder interviews; Rebuild the podcast publishing checklist; Publish the September editorial calendar. Still in flight: Cut the Q3 client showreel.'),
      ('yusuf@nexus.demo', 4, 'Shipped this week: Publish the September editorial calendar; Rebuild the podcast publishing checklist. Still in flight: Draft five channel scripts for the product launch; Record and edit three founder interviews.'),
      ('yusuf@nexus.demo', 5, 'Shipped this week: Publish the September editorial calendar. Still in flight: Rebuild the podcast publishing checklist.'),
      ('yusuf@nexus.demo', 6, 'Shipped this week: Publish the September editorial calendar. Still in flight: Close out captions and subtitles for the archive; Record and edit three founder interviews; Deliver the campaign launch film.'),
      ('yusuf@nexus.demo', 7, 'Shipped this week: Cut the Q3 client showreel; Draft five channel scripts for the product launch; Close out captions and subtitles for the archive.'),
      ('adaeze@nexus.demo', 0, 'Shipped this week: Deliver the rebrand key visuals; Finish the design token documentation. Still in flight: Rewrite onboarding email sequence.'),
      ('adaeze@nexus.demo', 1, 'Still in flight: Name and position the new service line; Refresh the pitch deck template; Write the landing page copy.'),
      ('adaeze@nexus.demo', 2, 'Shipped this week: Refresh the pitch deck template; Name and position the new service line; Finish the design token documentation; Deliver the rebrand key visuals.'),
      ('adaeze@nexus.demo', 3, 'Shipped this week: Produce campaign assets for the launch; Finish the design token documentation; Write the landing page copy. Still in flight: Refresh the pitch deck template.'),
      ('adaeze@nexus.demo', 5, 'Shipped this week: Refresh the pitch deck template; Name and position the new service line. Still in flight: Rewrite onboarding email sequence.'),
      ('adaeze@nexus.demo', 6, 'Shipped this week: Name and position the new service line; Finish the design token documentation; Deliver the rebrand key visuals. Still in flight: Refresh the pitch deck template.'),
      ('adaeze@nexus.demo', 7, 'Shipped this week: Finish the design token documentation; Produce campaign assets for the launch; Refresh the pitch deck template. Still in flight: Name and position the new service line.'),
      ('kelechi@nexus.demo', 0, 'Shipped this week: Deliver the rebrand key visuals. Still in flight: Rewrite onboarding email sequence; Write the landing page copy.'),
      ('kelechi@nexus.demo', 1, 'Shipped this week: Name and position the new service line; Deliver the rebrand key visuals; Emergency asset resize for the client pitch.'),
      ('kelechi@nexus.demo', 2, 'Shipped this week: Refresh the pitch deck template; Emergency asset resize for the client pitch; Unplanned rework after the brand feedback session; Name and position the new service line. Still in flight: Deliver the rebrand key visuals.'),
      ('kelechi@nexus.demo', 3, 'Shipped this week: Rewrite onboarding email sequence; Emergency asset resize for the client pitch; Unplanned rework after the brand feedback session.'),
      ('kelechi@nexus.demo', 4, 'Shipped this week: Emergency asset resize for the client pitch; Unplanned rework after the brand feedback session; Deliver the rebrand key visuals; Name and position the new service line.'),
      ('kelechi@nexus.demo', 5, 'Shipped this week: Name and position the new service line; Emergency asset resize for the client pitch; Refresh the pitch deck template; Unplanned rework after the brand feedback session.'),
      ('kelechi@nexus.demo', 6, 'Shipped this week: Emergency asset resize for the client pitch; Unplanned rework after the brand feedback session; Write the landing page copy. Still in flight: Name and position the new service line.'),
      ('kelechi@nexus.demo', 7, 'Shipped this week: Emergency asset resize for the client pitch; Unplanned rework after the brand feedback session. Still in flight: Finish the design token documentation; Refresh the pitch deck template; Write the landing page copy.'),
      ('halima@nexus.demo', 0, 'Shipped this week: Finish the design token documentation; Name and position the new service line. Still in flight: Rewrite onboarding email sequence.'),
      ('halima@nexus.demo', 1, 'Shipped this week: Name and position the new service line; Refresh the pitch deck template. Still in flight: Produce campaign assets for the launch; Write the landing page copy.'),
      ('halima@nexus.demo', 2, 'Shipped this week: Refresh the pitch deck template; Finish the design token documentation; Deliver the rebrand key visuals. Still in flight: Name and position the new service line.'),
      ('halima@nexus.demo', 3, 'Shipped this week: Refresh the pitch deck template; Rewrite onboarding email sequence; Finish the design token documentation.'),
      ('halima@nexus.demo', 4, 'Shipped this week: Deliver the rebrand key visuals; Produce campaign assets for the launch; Rewrite onboarding email sequence; Write the landing page copy.'),
      ('halima@nexus.demo', 5, 'Shipped this week: Finish the design token documentation; Name and position the new service line; Produce campaign assets for the launch; Rewrite onboarding email sequence. Still in flight: Refresh the pitch deck template.'),
      ('halima@nexus.demo', 6, 'Shipped this week: Finish the design token documentation; Write the landing page copy. Still in flight: Refresh the pitch deck template; Produce campaign assets for the launch.'),
      ('halima@nexus.demo', 7, 'Shipped this week: Rewrite onboarding email sequence; Deliver the rebrand key visuals. Still in flight: Refresh the pitch deck template.'),
      ('segun@nexus.demo', 0, 'Shipped this week: Onboard two new client accounts; Run the quarterly access review; Close out the Q3 vendor reconciliation. Still in flight: Document the escalation path for late deliverables.'),
      ('segun@nexus.demo', 1, 'Shipped this week: Run the quarterly access review; Document the escalation path for late deliverables. Still in flight: Onboard two new client accounts.'),
      ('segun@nexus.demo', 2, 'Shipped this week: Run the quarterly access review. Still in flight: Close out the Q3 vendor reconciliation; Rewrite the delivery handover checklist; Onboard two new client accounts; Document the escalation path for late deliverables.'),
      ('segun@nexus.demo', 3, 'Shipped this week: Close out the Q3 vendor reconciliation; Run the quarterly access review; Onboard two new client accounts.'),
      ('segun@nexus.demo', 4, 'Shipped this week: Run the quarterly access review; Onboard two new client accounts. Still in flight: Close out the Q3 vendor reconciliation; Document the escalation path for late deliverables.'),
      ('segun@nexus.demo', 5, 'Shipped this week: Run the quarterly access review. Still in flight: Onboard two new client accounts; Document the escalation path for late deliverables.'),
      ('segun@nexus.demo', 6, 'Shipped this week: Rewrite the delivery handover checklist; Run the quarterly access review; Onboard two new client accounts.'),
      ('blessing@nexus.demo', 0, 'Shipped this week: Onboard two new client accounts; Rewrite the delivery handover checklist; Close out the Q3 vendor reconciliation. Still in flight: Document the escalation path for late deliverables.'),
      ('blessing@nexus.demo', 1, 'Shipped this week: Rewrite the delivery handover checklist; Close out the Q3 vendor reconciliation; Onboard two new client accounts. Still in flight: Document the escalation path for late deliverables.'),
      ('blessing@nexus.demo', 4, 'Shipped this week: Rewrite the delivery handover checklist; Run the quarterly access review; Close out the Q3 vendor reconciliation; Document the escalation path for late deliverables.'),
      ('blessing@nexus.demo', 5, 'Shipped this week: Rewrite the delivery handover checklist; Document the escalation path for late deliverables. Still in flight: Close out the Q3 vendor reconciliation.'),
      ('blessing@nexus.demo', 6, 'Shipped this week: Run the quarterly access review. Still in flight: Rewrite the delivery handover checklist; Document the escalation path for late deliverables; Onboard two new client accounts.'),
      ('blessing@nexus.demo', 7, 'Shipped this week: Document the escalation path for late deliverables; Onboard two new client accounts; Rewrite the delivery handover checklist.'),
      ('ifeoma@nexus.demo', 0, 'Shipped this week: Sign the distribution partnership; Build the Q4 outbound sequence. Still in flight: Qualify the inbound partnership pipeline; Close the two outstanding renewal conversations.'),
      ('ifeoma@nexus.demo', 1, 'Shipped this week: Sign the distribution partnership. Still in flight: Build the Q4 outbound sequence; Run the partner enablement session; Qualify the inbound partnership pipeline.'),
      ('ifeoma@nexus.demo', 2, 'Shipped this week: Close the two outstanding renewal conversations; Qualify the inbound partnership pipeline; Build the Q4 outbound sequence; Sign the distribution partnership.'),
      ('ifeoma@nexus.demo', 3, 'Shipped this week: Close the two outstanding renewal conversations; Build the Q4 outbound sequence. Still in flight: Run the partner enablement session; Qualify the inbound partnership pipeline; Sign the distribution partnership.'),
      ('ifeoma@nexus.demo', 4, 'Shipped this week: Sign the distribution partnership; Qualify the inbound partnership pipeline. Still in flight: Build the Q4 outbound sequence; Close the two outstanding renewal conversations; Run the partner enablement session.'),
      ('ifeoma@nexus.demo', 5, 'Shipped this week: Sign the distribution partnership. Still in flight: Qualify the inbound partnership pipeline; Run the partner enablement session.'),
      ('ifeoma@nexus.demo', 6, 'Shipped this week: Qualify the inbound partnership pipeline; Close the two outstanding renewal conversations; Run the partner enablement session. Still in flight: Build the Q4 outbound sequence; Sign the distribution partnership.'),
      ('ifeoma@nexus.demo', 7, 'Shipped this week: Qualify the inbound partnership pipeline; Build the Q4 outbound sequence. Still in flight: Run the partner enablement session.'),
      ('musa@nexus.demo', 0, 'Shipped this week: Qualify the inbound partnership pipeline; Close the two outstanding renewal conversations. Still in flight: Sign the distribution partnership; Run the partner enablement session.'),
      ('musa@nexus.demo', 1, 'Shipped this week: Sign the distribution partnership; Run the partner enablement session; Close the two outstanding renewal conversations. Still in flight: Qualify the inbound partnership pipeline; Build the Q4 outbound sequence.'),
      ('musa@nexus.demo', 2, 'Shipped this week: Qualify the inbound partnership pipeline; Build the Q4 outbound sequence; Sign the distribution partnership; Close the two outstanding renewal conversations. Still in flight: Run the partner enablement session.'),
      ('musa@nexus.demo', 3, 'Shipped this week: Close the two outstanding renewal conversations. Still in flight: Sign the distribution partnership.'),
      ('musa@nexus.demo', 4, 'Shipped this week: Qualify the inbound partnership pipeline; Close the two outstanding renewal conversations; Build the Q4 outbound sequence; Run the partner enablement session.'),
      ('musa@nexus.demo', 5, 'Shipped this week: Sign the distribution partnership; Qualify the inbound partnership pipeline. Still in flight: Build the Q4 outbound sequence.'),
      ('musa@nexus.demo', 6, 'Shipped this week: Build the Q4 outbound sequence. Still in flight: Close the two outstanding renewal conversations; Qualify the inbound partnership pipeline.'),
      ('musa@nexus.demo', 7, 'Shipped this week: Qualify the inbound partnership pipeline; Build the Q4 outbound sequence.'),
      ('hr@nexus.demo', 0, 'Shipped this week: Complete the quarterly right-to-work checks; Finish the annual leave policy update. Still in flight: Refresh the onboarding handbook; Publish the updated role scorecards; Close out the two open engineering offers.'),
      ('hr@nexus.demo', 1, 'Shipped this week: Refresh the onboarding handbook; Finish the annual leave policy update.'),
      ('hr@nexus.demo', 2, 'Shipped this week: Close out the two open engineering offers; Run the interview panel calibration session. Still in flight: Refresh the onboarding handbook; Complete the quarterly right-to-work checks.'),
      ('hr@nexus.demo', 3, 'Shipped this week: Publish the updated role scorecards. Still in flight: Finish the annual leave policy update; Run the interview panel calibration session; Complete the quarterly right-to-work checks.'),
      ('hr@nexus.demo', 4, 'Shipped this week: Complete the quarterly right-to-work checks; Close out the two open engineering offers. Still in flight: Run the interview panel calibration session; Finish the annual leave policy update.'),
      ('hr@nexus.demo', 5, 'Shipped this week: Run the interview panel calibration session; Complete the quarterly right-to-work checks. Still in flight: Publish the updated role scorecards.'),
      ('hr@nexus.demo', 6, 'Shipped this week: Complete the quarterly right-to-work checks; Refresh the onboarding handbook. Still in flight: Finish the annual leave policy update.'),
      ('hr@nexus.demo', 7, 'Shipped this week: Complete the quarterly right-to-work checks; Run the interview panel calibration session. Still in flight: Publish the updated role scorecards; Refresh the onboarding handbook.')
  ) as c(email, week_offset, raw_text)
  join profiles p on p.org_id = v_org and p.email = c.email
  join cycles cy on cy.org_id = v_org and cy.kind = 'week'
                and cy.starts_on = v_anchor + (c.week_offset * 7);

  -- ---- commitments --------------------------------------------------------
  -- Inserted one row at a time so each generated id can be tied back to its
  -- natural_key with certainty. A set-based INSERT ... RETURNING cannot do
  -- this: two commitments by the same person in the same week may share a
  -- title, and the rollover chain would then stitch itself to the wrong
  -- parent — silently corrupting the exact signal this seed exists to plant.
  create temporary table seed_raw (
    natural_key      text,
    email            text,
    week_offset      integer,
    title            text,
    category         text,
    priority         text,
    status           text,
    declared         boolean,
    blocker          text,
    depends_dept     text,
    was_planned      boolean,
    carried_from_key text,
    est_hours        numeric,
    act_hours        numeric,
    quote            text
  ) on commit drop;

  insert into seed_raw values
      ('amara@nexus.demo|0|0', 'amara@nexus.demo', 0, 'Migrate the reporting pipeline to the new warehouse', 'backend', 'high', 'partial', false, 'none', null, true, null, 8.00, 7.10, 'Planning to migrate the reporting pipeline to the new warehouse.'),
      ('amara@nexus.demo|0|1', 'amara@nexus.demo', 0, 'Set up alerting for failed background jobs', 'infra', 'high', 'in_progress', true, 'none', null, true, null, 13.00, null, 'Planning to set up alerting for failed background jobs.'),
      ('amara@nexus.demo|0|2', 'amara@nexus.demo', 0, 'Cut API p95 latency below 300ms', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 4.80, 'Finished cut api p95 latency below 300ms this week.'),
      ('amara@nexus.demo|0|3', 'amara@nexus.demo', 0, 'Rotate the production credentials', 'infra', 'normal', 'partial', false, 'none', null, true, null, 10.00, 9.90, 'Planning to rotate the production credentials.'),
      ('amara@nexus.demo|0|4', 'amara@nexus.demo', 0, 'Ship the commitment reconciliation endpoint', 'backend', 'normal', 'in_progress', false, 'none', null, true, null, 13.00, null, 'Planning to ship the commitment reconciliation endpoint.'),
      ('amara@nexus.demo|0|5', 'amara@nexus.demo', 0, 'Rebuild the department drill-down view', 'frontend', 'normal', 'deferred', true, 'none', null, true, null, 9.00, null, 'Planning to rebuild the department drill-down view.'),
      ('amara@nexus.demo|0|6', 'amara@nexus.demo', 0, 'Add retry + backoff to the webhook dispatcher', 'backend', 'high', 'delivered', false, 'none', null, true, null, 5.00, 4.90, 'Finished add retry + backoff to the webhook dispatcher this week.'),
      ('amara@nexus.demo|1|0', 'amara@nexus.demo', 1, 'Migrate the reporting pipeline to the new warehouse', 'backend', 'high', 'partial', false, 'none', null, true, 'amara@nexus.demo|0|0', 6.00, 6.80, 'Planning to migrate the reporting pipeline to the new warehouse.'),
      ('amara@nexus.demo|1|1', 'amara@nexus.demo', 1, 'Ship the commitment reconciliation endpoint', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 5.20, 'Finished ship the commitment reconciliation endpoint this week.'),
      ('amara@nexus.demo|1|2', 'amara@nexus.demo', 1, 'Harden the inbound email parser against malformed MIME', 'backend', 'normal', 'in_progress', false, 'none', null, true, null, 6.00, null, 'Planning to harden the inbound email parser against malformed mime.'),
      ('amara@nexus.demo|1|3', 'amara@nexus.demo', 1, 'Add keyboard navigation to the commitment list', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 8.70, 'Finished add keyboard navigation to the commitment list this week.'),
      ('amara@nexus.demo|1|4', 'amara@nexus.demo', 1, 'Move session storage off the primary database', 'backend', 'high', 'delivered', false, 'none', null, true, null, 7.00, 6.40, 'Finished move session storage off the primary database this week.'),
      ('amara@nexus.demo|1|5', 'amara@nexus.demo', 1, 'Roll staging onto the new deployment pipeline', 'infra', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 8.40, 'Finished roll staging onto the new deployment pipeline this week.'),
      ('amara@nexus.demo|1|6', 'amara@nexus.demo', 1, 'Rebuild the department drill-down view', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 9.40, 'Finished rebuild the department drill-down view this week.'),
      ('amara@nexus.demo|2|0', 'amara@nexus.demo', 2, 'Migrate the reporting pipeline to the new warehouse', 'backend', 'high', 'partial', false, 'none', null, true, 'amara@nexus.demo|1|0', 11.00, 11.60, 'Planning to migrate the reporting pipeline to the new warehouse.'),
      ('amara@nexus.demo|2|1', 'amara@nexus.demo', 2, 'Fix layout shift on the dashboard header', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 13.30, 'Finished fix layout shift on the dashboard header this week.'),
      ('amara@nexus.demo|2|2', 'amara@nexus.demo', 2, 'Add retry + backoff to the webhook dispatcher', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 7.50, 'Finished add retry + backoff to the webhook dispatcher this week.'),
      ('amara@nexus.demo|2|3', 'amara@nexus.demo', 2, 'Add keyboard navigation to the commitment list', 'frontend', 'normal', 'partial', false, 'none', null, true, null, 5.00, 5.40, 'Planning to add keyboard navigation to the commitment list.'),
      ('amara@nexus.demo|2|4', 'amara@nexus.demo', 2, 'Harden the inbound email parser against malformed MIME', 'backend', 'normal', 'partial', false, 'none', null, true, null, 13.00, 14.50, 'Planning to harden the inbound email parser against malformed mime.'),
      ('amara@nexus.demo|2|5', 'amara@nexus.demo', 2, 'Set up alerting for failed background jobs', 'infra', 'normal', 'deferred', true, 'none', null, true, null, 8.00, null, 'Planning to set up alerting for failed background jobs.'),
      ('amara@nexus.demo|3|0', 'amara@nexus.demo', 3, 'Migrate the reporting pipeline to the new warehouse', 'backend', 'high', 'partial', false, 'none', null, true, 'amara@nexus.demo|2|0', 3.00, 3.40, 'Planning to migrate the reporting pipeline to the new warehouse.'),
      ('amara@nexus.demo|3|1', 'amara@nexus.demo', 3, 'Rotate the production credentials', 'infra', 'normal', 'partial', false, 'none', null, true, null, 10.00, 9.10, 'Planning to rotate the production credentials.'),
      ('amara@nexus.demo|3|2', 'amara@nexus.demo', 3, 'Cut API p95 latency below 300ms', 'backend', 'high', 'partial', false, 'none', null, true, null, 7.00, 6.30, 'Planning to cut api p95 latency below 300ms.'),
      ('amara@nexus.demo|3|3', 'amara@nexus.demo', 3, 'Add retry + backoff to the webhook dispatcher', 'backend', 'normal', 'in_progress', false, 'none', null, true, null, 8.00, null, 'Planning to add retry + backoff to the webhook dispatcher.'),
      ('amara@nexus.demo|3|4', 'amara@nexus.demo', 3, 'Move session storage off the primary database', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 6.40, 'Finished move session storage off the primary database this week.'),
      ('amara@nexus.demo|3|5', 'amara@nexus.demo', 3, 'Set up alerting for failed background jobs', 'infra', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 11.80, 'Finished set up alerting for failed background jobs this week.'),
      ('amara@nexus.demo|3|6', 'amara@nexus.demo', 3, 'Rebuild the department drill-down view', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 14.00, 12.80, 'Finished rebuild the department drill-down view this week.'),
      ('amara@nexus.demo|4|0', 'amara@nexus.demo', 4, 'Migrate the reporting pipeline to the new warehouse', 'backend', 'high', 'in_progress', false, 'none', null, true, 'amara@nexus.demo|3|0', 12.00, null, 'Planning to migrate the reporting pipeline to the new warehouse.'),
      ('amara@nexus.demo|4|1', 'amara@nexus.demo', 4, 'Move session storage off the primary database', 'backend', 'high', 'delivered', false, 'none', null, true, null, 5.00, 5.00, 'Finished move session storage off the primary database this week.'),
      ('amara@nexus.demo|4|2', 'amara@nexus.demo', 4, 'Add retry + backoff to the webhook dispatcher', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 8.40, 'Finished add retry + backoff to the webhook dispatcher this week.'),
      ('amara@nexus.demo|4|3', 'amara@nexus.demo', 4, 'Fix layout shift on the dashboard header', 'frontend', 'normal', 'deferred', false, 'none', null, true, null, 9.00, null, 'Planning to fix layout shift on the dashboard header.'),
      ('amara@nexus.demo|4|4', 'amara@nexus.demo', 4, 'Roll staging onto the new deployment pipeline', 'infra', 'normal', 'deferred', true, 'none', null, true, null, 14.00, null, 'Planning to roll staging onto the new deployment pipeline.'),
      ('amara@nexus.demo|4|5', 'amara@nexus.demo', 4, 'Add keyboard navigation to the commitment list', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 5.30, 'Finished add keyboard navigation to the commitment list this week.'),
      ('amara@nexus.demo|4|6', 'amara@nexus.demo', 4, 'Rebuild the department drill-down view', 'frontend', 'normal', 'deferred', false, 'none', null, true, null, 6.00, null, 'Planning to rebuild the department drill-down view.'),
      ('amara@nexus.demo|5|0', 'amara@nexus.demo', 5, 'Migrate the reporting pipeline to the new warehouse', 'backend', 'high', 'partial', false, 'none', null, true, 'amara@nexus.demo|4|0', 7.00, 6.00, 'Planning to migrate the reporting pipeline to the new warehouse.'),
      ('amara@nexus.demo|5|1', 'amara@nexus.demo', 5, 'Fix layout shift on the dashboard header', 'frontend', 'normal', 'in_progress', false, 'none', null, true, null, 3.00, null, 'Planning to fix layout shift on the dashboard header.'),
      ('amara@nexus.demo|5|2', 'amara@nexus.demo', 5, 'Cut API p95 latency below 300ms', 'backend', 'normal', 'partial', true, 'none', null, true, null, 9.00, 8.60, 'Planning to cut api p95 latency below 300ms.'),
      ('amara@nexus.demo|5|3', 'amara@nexus.demo', 5, 'Add keyboard navigation to the commitment list', 'frontend', 'normal', 'deferred', false, 'none', null, true, null, 11.00, null, 'Planning to add keyboard navigation to the commitment list.'),
      ('amara@nexus.demo|5|4', 'amara@nexus.demo', 5, 'Move session storage off the primary database', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 6.30, 'Finished move session storage off the primary database this week.'),
      ('amara@nexus.demo|5|5', 'amara@nexus.demo', 5, 'Set up alerting for failed background jobs', 'infra', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 12.00, 'Finished set up alerting for failed background jobs this week.'),
      ('amara@nexus.demo|6|0', 'amara@nexus.demo', 6, 'Migrate the reporting pipeline to the new warehouse', 'backend', 'high', 'in_progress', false, 'none', null, true, 'amara@nexus.demo|5|0', 7.00, null, 'Planning to migrate the reporting pipeline to the new warehouse.'),
      ('amara@nexus.demo|6|1', 'amara@nexus.demo', 6, 'Roll staging onto the new deployment pipeline', 'infra', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 3.60, 'Finished roll staging onto the new deployment pipeline this week.'),
      ('amara@nexus.demo|6|2', 'amara@nexus.demo', 6, 'Ship the commitment reconciliation endpoint', 'backend', 'normal', 'deferred', false, 'none', null, true, null, 8.00, null, 'Planning to ship the commitment reconciliation endpoint.'),
      ('amara@nexus.demo|6|3', 'amara@nexus.demo', 6, 'Add keyboard navigation to the commitment list', 'frontend', 'normal', 'in_progress', false, 'none', null, true, null, 11.00, null, 'Planning to add keyboard navigation to the commitment list.'),
      ('amara@nexus.demo|6|4', 'amara@nexus.demo', 6, 'Move session storage off the primary database', 'backend', 'normal', 'in_progress', false, 'none', null, true, null, 5.00, null, 'Planning to move session storage off the primary database.'),
      ('amara@nexus.demo|6|5', 'amara@nexus.demo', 6, 'Add retry + backoff to the webhook dispatcher', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 5.90, 'Finished add retry + backoff to the webhook dispatcher this week.'),
      ('amara@nexus.demo|6|6', 'amara@nexus.demo', 6, 'Rebuild the department drill-down view', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 4.10, 'Finished rebuild the department drill-down view this week.'),
      ('amara@nexus.demo|7|0', 'amara@nexus.demo', 7, 'Migrate the reporting pipeline to the new warehouse', 'backend', 'high', 'delivered', true, 'none', null, true, 'amara@nexus.demo|6|0', 6.00, 6.80, 'Finished migrate the reporting pipeline to the new warehouse this week.'),
      ('amara@nexus.demo|7|1', 'amara@nexus.demo', 7, 'Ship the commitment reconciliation endpoint', 'backend', 'high', 'deferred', true, 'none', null, true, null, 4.00, null, 'Planning to ship the commitment reconciliation endpoint.'),
      ('amara@nexus.demo|7|2', 'amara@nexus.demo', 7, 'Rotate the production credentials', 'infra', 'normal', 'deferred', true, 'none', null, true, null, 10.00, null, 'Planning to rotate the production credentials.'),
      ('amara@nexus.demo|7|3', 'amara@nexus.demo', 7, 'Move session storage off the primary database', 'backend', 'normal', 'partial', false, 'none', null, true, null, 10.00, 10.60, 'Planning to move session storage off the primary database.'),
      ('amara@nexus.demo|7|4', 'amara@nexus.demo', 7, 'Roll staging onto the new deployment pipeline', 'infra', 'normal', 'in_progress', true, 'none', null, true, null, 14.00, null, 'Planning to roll staging onto the new deployment pipeline.'),
      ('amara@nexus.demo|7|5', 'amara@nexus.demo', 7, 'Rebuild the department drill-down view', 'frontend', 'normal', 'deferred', true, 'none', null, true, null, 11.00, null, 'Planning to rebuild the department drill-down view.'),
      ('amara@nexus.demo|7|6', 'amara@nexus.demo', 7, 'Fix layout shift on the dashboard header', 'frontend', 'normal', 'deferred', true, 'none', null, true, null, 9.00, null, 'Planning to fix layout shift on the dashboard header.'),
      ('amara@nexus.demo|7|7', 'amara@nexus.demo', 7, 'Harden the inbound email parser against malformed MIME', 'backend', 'normal', 'partial', true, 'none', null, true, null, 8.00, 8.80, 'Planning to harden the inbound email parser against malformed mime.'),
      ('chidi@nexus.demo|0|0', 'chidi@nexus.demo', 0, 'Integrate the new brand assets into the app shell', 'frontend', 'normal', 'blocked', true, 'external_team', 'creative-hub', true, null, 7.00, null, 'Still stuck on integrate the new brand assets into the app shell — waiting on Creative Hub.'),
      ('chidi@nexus.demo|0|1', 'chidi@nexus.demo', 0, 'Ship the campaign landing page', 'frontend', 'normal', 'blocked', true, 'external_team', 'creative-hub', true, null, 5.00, null, 'Still stuck on ship the campaign landing page — waiting on Creative Hub.'),
      ('chidi@nexus.demo|0|2', 'chidi@nexus.demo', 0, 'Cut API p95 latency below 300ms', 'backend', 'normal', 'partial', false, 'none', null, true, null, 10.00, 9.40, 'Planning to cut api p95 latency below 300ms.'),
      ('chidi@nexus.demo|1|0', 'chidi@nexus.demo', 1, 'Integrate the new brand assets into the app shell', 'frontend', 'high', 'blocked', false, 'external_team', 'creative-hub', true, null, 6.00, null, 'Still stuck on integrate the new brand assets into the app shell — waiting on Creative Hub.'),
      ('chidi@nexus.demo|1|1', 'chidi@nexus.demo', 1, 'Ship the campaign landing page', 'frontend', 'normal', 'blocked', false, 'external_team', 'creative-hub', true, null, 6.00, null, 'Still stuck on ship the campaign landing page — waiting on Creative Hub.'),
      ('chidi@nexus.demo|1|2', 'chidi@nexus.demo', 1, 'Cut API p95 latency below 300ms', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 7.00, 'Finished cut api p95 latency below 300ms this week.'),
      ('chidi@nexus.demo|1|3', 'chidi@nexus.demo', 1, 'Fix layout shift on the dashboard header', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 3.00, 2.60, 'Finished fix layout shift on the dashboard header this week.'),
      ('chidi@nexus.demo|1|4', 'chidi@nexus.demo', 1, 'Move session storage off the primary database', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 12.80, 'Finished move session storage off the primary database this week.'),
      ('chidi@nexus.demo|2|0', 'chidi@nexus.demo', 2, 'Integrate the new brand assets into the app shell', 'frontend', 'normal', 'blocked', true, 'external_team', 'creative-hub', true, null, 9.00, null, 'Still stuck on integrate the new brand assets into the app shell — waiting on Creative Hub.'),
      ('chidi@nexus.demo|2|1', 'chidi@nexus.demo', 2, 'Ship the campaign landing page', 'frontend', 'normal', 'blocked', true, 'external_team', 'creative-hub', true, null, 9.00, null, 'Still stuck on ship the campaign landing page — waiting on Creative Hub.'),
      ('chidi@nexus.demo|2|2', 'chidi@nexus.demo', 2, 'Add retry + backoff to the webhook dispatcher', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 7.70, 'Finished add retry + backoff to the webhook dispatcher this week.'),
      ('chidi@nexus.demo|3|0', 'chidi@nexus.demo', 3, 'Integrate the new brand assets into the app shell', 'frontend', 'high', 'blocked', true, 'external_team', 'creative-hub', true, null, 13.00, null, 'Still stuck on integrate the new brand assets into the app shell — waiting on Creative Hub.'),
      ('chidi@nexus.demo|3|1', 'chidi@nexus.demo', 3, 'Ship the campaign landing page', 'frontend', 'normal', 'blocked', true, 'external_team', 'creative-hub', true, null, 12.00, null, 'Still stuck on ship the campaign landing page — waiting on Creative Hub.'),
      ('chidi@nexus.demo|3|2', 'chidi@nexus.demo', 3, 'Move session storage off the primary database', 'backend', 'high', 'delivered', false, 'none', null, true, null, 10.00, 9.80, 'Finished move session storage off the primary database this week.'),
      ('chidi@nexus.demo|3|3', 'chidi@nexus.demo', 3, 'Add keyboard navigation to the commitment list', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 12.50, 'Finished add keyboard navigation to the commitment list this week.'),
      ('chidi@nexus.demo|4|0', 'chidi@nexus.demo', 4, 'Integrate the new brand assets into the app shell', 'frontend', 'normal', 'blocked', true, 'external_team', 'creative-hub', true, null, 3.00, null, 'Still stuck on integrate the new brand assets into the app shell — waiting on Creative Hub.'),
      ('chidi@nexus.demo|4|1', 'chidi@nexus.demo', 4, 'Ship the campaign landing page', 'frontend', 'normal', 'blocked', true, 'external_team', 'creative-hub', true, null, 4.00, null, 'Still stuck on ship the campaign landing page — waiting on Creative Hub.'),
      ('chidi@nexus.demo|4|2', 'chidi@nexus.demo', 4, 'Ship the commitment reconciliation endpoint', 'backend', 'critical', 'partial', true, 'none', null, true, null, 5.00, 5.30, 'Planning to ship the commitment reconciliation endpoint.'),
      ('chidi@nexus.demo|4|3', 'chidi@nexus.demo', 4, 'Fix layout shift on the dashboard header', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 3.50, 'Finished fix layout shift on the dashboard header this week.'),
      ('chidi@nexus.demo|5|0', 'chidi@nexus.demo', 5, 'Integrate the new brand assets into the app shell', 'frontend', 'normal', 'blocked', true, 'external_team', 'creative-hub', true, null, 10.00, null, 'Still stuck on integrate the new brand assets into the app shell — waiting on Creative Hub.'),
      ('chidi@nexus.demo|5|1', 'chidi@nexus.demo', 5, 'Ship the campaign landing page', 'frontend', 'normal', 'blocked', true, 'external_team', 'creative-hub', true, null, 9.00, null, 'Still stuck on ship the campaign landing page — waiting on Creative Hub.'),
      ('chidi@nexus.demo|5|2', 'chidi@nexus.demo', 5, 'Rotate the production credentials', 'infra', 'normal', 'deferred', false, 'none', null, true, null, 5.00, null, 'Planning to rotate the production credentials.'),
      ('chidi@nexus.demo|6|0', 'chidi@nexus.demo', 6, 'Integrate the new brand assets into the app shell', 'frontend', 'normal', 'blocked', true, 'external_team', 'creative-hub', true, null, 5.00, null, 'Still stuck on integrate the new brand assets into the app shell — waiting on Creative Hub.'),
      ('chidi@nexus.demo|6|1', 'chidi@nexus.demo', 6, 'Ship the campaign landing page', 'frontend', 'normal', 'blocked', true, 'external_team', 'creative-hub', true, null, 14.00, null, 'Still stuck on ship the campaign landing page — waiting on Creative Hub.'),
      ('chidi@nexus.demo|6|2', 'chidi@nexus.demo', 6, 'Add keyboard navigation to the commitment list', 'frontend', 'high', 'delivered', false, 'none', null, true, null, 9.00, 7.90, 'Finished add keyboard navigation to the commitment list this week.'),
      ('chidi@nexus.demo|7|0', 'chidi@nexus.demo', 7, 'Integrate the new brand assets into the app shell', 'frontend', 'critical', 'blocked', true, 'external_team', 'creative-hub', true, null, 10.00, null, 'Still stuck on integrate the new brand assets into the app shell — waiting on Creative Hub.'),
      ('chidi@nexus.demo|7|1', 'chidi@nexus.demo', 7, 'Ship the campaign landing page', 'frontend', 'normal', 'blocked', true, 'external_team', 'creative-hub', true, null, 7.00, null, 'Still stuck on ship the campaign landing page — waiting on Creative Hub.'),
      ('chidi@nexus.demo|7|2', 'chidi@nexus.demo', 7, 'Add keyboard navigation to the commitment list', 'frontend', 'normal', 'partial', true, 'none', null, true, null, 8.00, 9.20, 'Planning to add keyboard navigation to the commitment list.'),
      ('chidi@nexus.demo|7|3', 'chidi@nexus.demo', 7, 'Roll staging onto the new deployment pipeline', 'infra', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.20, 'Finished roll staging onto the new deployment pipeline this week.'),
      ('zainab@nexus.demo|0|0', 'zainab@nexus.demo', 0, 'Ship the commitment reconciliation endpoint', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 11.60, 'Finished ship the commitment reconciliation endpoint this week.'),
      ('zainab@nexus.demo|0|1', 'zainab@nexus.demo', 0, 'Roll staging onto the new deployment pipeline', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 11.50, 'Finished roll staging onto the new deployment pipeline this week.'),
      ('zainab@nexus.demo|0|2', 'zainab@nexus.demo', 0, 'Set up alerting for failed background jobs', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 9.20, 'Finished set up alerting for failed background jobs this week.'),
      ('zainab@nexus.demo|0|3', 'zainab@nexus.demo', 0, 'Fix layout shift on the dashboard header', 'backend', 'normal', 'partial', false, 'none', null, true, null, 9.00, 11.80, 'Planning to fix layout shift on the dashboard header.'),
      ('zainab@nexus.demo|1|0', 'zainab@nexus.demo', 1, 'Rebuild the department drill-down view', 'backend', 'high', 'delivered', false, 'none', null, true, null, 7.00, 9.40, 'Finished rebuild the department drill-down view this week.'),
      ('zainab@nexus.demo|1|1', 'zainab@nexus.demo', 1, 'Roll staging onto the new deployment pipeline', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 9.30, 'Finished roll staging onto the new deployment pipeline this week.'),
      ('zainab@nexus.demo|1|2', 'zainab@nexus.demo', 1, 'Rotate the production credentials', 'backend', 'high', 'delivered', false, 'none', null, true, null, 5.00, 7.00, 'Finished rotate the production credentials this week.'),
      ('zainab@nexus.demo|1|3', 'zainab@nexus.demo', 1, 'Move session storage off the primary database', 'backend', 'normal', 'partial', false, 'none', null, true, null, 10.00, 14.30, 'Planning to move session storage off the primary database.'),
      ('zainab@nexus.demo|1|4', 'zainab@nexus.demo', 1, 'Harden the inbound email parser against malformed MIME', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 5.70, 'Finished harden the inbound email parser against malformed mime this week.'),
      ('zainab@nexus.demo|2|0', 'zainab@nexus.demo', 2, 'Cut API p95 latency below 300ms', 'backend', 'normal', 'partial', false, 'none', null, true, null, 6.00, 8.80, 'Planning to cut api p95 latency below 300ms.'),
      ('zainab@nexus.demo|2|1', 'zainab@nexus.demo', 2, 'Rotate the production credentials', 'backend', 'normal', 'partial', false, 'none', null, true, null, 5.00, 6.60, 'Planning to rotate the production credentials.'),
      ('zainab@nexus.demo|2|2', 'zainab@nexus.demo', 2, 'Roll staging onto the new deployment pipeline', 'backend', 'normal', 'partial', false, 'none', null, true, null, 9.00, 13.40, 'Planning to roll staging onto the new deployment pipeline.'),
      ('zainab@nexus.demo|2|3', 'zainab@nexus.demo', 2, 'Rebuild the department drill-down view', 'backend', 'high', 'delivered', false, 'none', null, true, null, 8.00, 11.90, 'Finished rebuild the department drill-down view this week.'),
      ('zainab@nexus.demo|3|0', 'zainab@nexus.demo', 3, 'Ship the commitment reconciliation endpoint', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 13.80, 'Finished ship the commitment reconciliation endpoint this week.'),
      ('zainab@nexus.demo|3|1', 'zainab@nexus.demo', 3, 'Add keyboard navigation to the commitment list', 'backend', 'high', 'partial', false, 'none', null, true, null, 8.00, 11.00, 'Planning to add keyboard navigation to the commitment list.'),
      ('zainab@nexus.demo|3|2', 'zainab@nexus.demo', 3, 'Rotate the production credentials', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 15.60, 'Finished rotate the production credentials this week.'),
      ('zainab@nexus.demo|3|3', 'zainab@nexus.demo', 3, 'Fix layout shift on the dashboard header', 'backend', 'high', 'partial', false, 'none', null, true, null, 5.00, 6.80, 'Planning to fix layout shift on the dashboard header.'),
      ('zainab@nexus.demo|3|4', 'zainab@nexus.demo', 3, 'Roll staging onto the new deployment pipeline', 'backend', 'high', 'delivered', false, 'none', null, true, null, 5.00, 6.60, 'Finished roll staging onto the new deployment pipeline this week.'),
      ('zainab@nexus.demo|4|0', 'zainab@nexus.demo', 4, 'Cut API p95 latency below 300ms', 'backend', 'normal', 'partial', false, 'none', null, true, null, 10.00, 14.80, 'Planning to cut api p95 latency below 300ms.'),
      ('zainab@nexus.demo|4|1', 'zainab@nexus.demo', 4, 'Ship the commitment reconciliation endpoint', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 6.00, 'Finished ship the commitment reconciliation endpoint this week.'),
      ('zainab@nexus.demo|4|2', 'zainab@nexus.demo', 4, 'Rotate the production credentials', 'backend', 'normal', 'partial', false, 'none', null, true, null, 6.00, 7.80, 'Planning to rotate the production credentials.'),
      ('zainab@nexus.demo|5|0', 'zainab@nexus.demo', 5, 'Rotate the production credentials', 'backend', 'normal', 'partial', false, 'none', null, true, null, 12.00, 17.60, 'Planning to rotate the production credentials.'),
      ('zainab@nexus.demo|5|1', 'zainab@nexus.demo', 5, 'Fix layout shift on the dashboard header', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 8.00, 'Finished fix layout shift on the dashboard header this week.'),
      ('zainab@nexus.demo|5|2', 'zainab@nexus.demo', 5, 'Cut API p95 latency below 300ms', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 10.20, 'Finished cut api p95 latency below 300ms this week.'),
      ('zainab@nexus.demo|5|3', 'zainab@nexus.demo', 5, 'Ship the commitment reconciliation endpoint', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 9.90, 'Finished ship the commitment reconciliation endpoint this week.'),
      ('zainab@nexus.demo|6|0', 'zainab@nexus.demo', 6, 'Add keyboard navigation to the commitment list', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 8.50, 'Finished add keyboard navigation to the commitment list this week.'),
      ('zainab@nexus.demo|6|1', 'zainab@nexus.demo', 6, 'Ship the commitment reconciliation endpoint', 'backend', 'critical', 'delivered', false, 'none', null, true, null, 7.00, 9.90, 'Finished ship the commitment reconciliation endpoint this week.'),
      ('zainab@nexus.demo|6|2', 'zainab@nexus.demo', 6, 'Rotate the production credentials', 'backend', 'high', 'delivered', false, 'none', null, true, null, 7.00, 9.80, 'Finished rotate the production credentials this week.'),
      ('zainab@nexus.demo|6|3', 'zainab@nexus.demo', 6, 'Roll staging onto the new deployment pipeline', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 6.90, 'Finished roll staging onto the new deployment pipeline this week.'),
      ('zainab@nexus.demo|7|0', 'zainab@nexus.demo', 7, 'Roll staging onto the new deployment pipeline', 'backend', 'critical', 'delivered', false, 'none', null, true, null, 8.00, 11.50, 'Finished roll staging onto the new deployment pipeline this week.'),
      ('zainab@nexus.demo|7|1', 'zainab@nexus.demo', 7, 'Fix layout shift on the dashboard header', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 8.20, 'Finished fix layout shift on the dashboard header this week.'),
      ('zainab@nexus.demo|7|2', 'zainab@nexus.demo', 7, 'Set up alerting for failed background jobs', 'backend', 'normal', 'partial', false, 'none', null, true, null, 12.00, 17.90, 'Planning to set up alerting for failed background jobs.'),
      ('zainab@nexus.demo|7|3', 'zainab@nexus.demo', 7, 'Ship the commitment reconciliation endpoint', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 10.50, 'Finished ship the commitment reconciliation endpoint this week.'),
      ('emeka@nexus.demo|0|0', 'emeka@nexus.demo', 0, 'Cut API p95 latency below 300ms', 'backend', 'high', 'partial', false, 'none', null, true, null, 14.00, 14.20, 'Planning to cut api p95 latency below 300ms.'),
      ('emeka@nexus.demo|0|1', 'emeka@nexus.demo', 0, 'Ship the commitment reconciliation endpoint', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 10.90, 'Finished ship the commitment reconciliation endpoint this week.'),
      ('emeka@nexus.demo|0|2', 'emeka@nexus.demo', 0, 'Rotate the production credentials', 'infra', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 4.30, 'Finished rotate the production credentials this week.'),
      ('emeka@nexus.demo|1|0', 'emeka@nexus.demo', 1, 'Rotate the production credentials', 'infra', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 9.60, 'Finished rotate the production credentials this week.'),
      ('emeka@nexus.demo|1|1', 'emeka@nexus.demo', 1, 'Rebuild the department drill-down view', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 9.10, 'Finished rebuild the department drill-down view this week.'),
      ('emeka@nexus.demo|1|2', 'emeka@nexus.demo', 1, 'Add keyboard navigation to the commitment list', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 8.30, 'Finished add keyboard navigation to the commitment list this week.'),
      ('emeka@nexus.demo|1|3', 'emeka@nexus.demo', 1, 'Ship the commitment reconciliation endpoint', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 9.30, 'Finished ship the commitment reconciliation endpoint this week.'),
      ('emeka@nexus.demo|2|0', 'emeka@nexus.demo', 2, 'Ship the commitment reconciliation endpoint', 'backend', 'high', 'delivered', false, 'none', null, true, null, 7.00, 7.00, 'Finished ship the commitment reconciliation endpoint this week.'),
      ('emeka@nexus.demo|2|1', 'emeka@nexus.demo', 2, 'Cut API p95 latency below 300ms', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 4.50, 'Finished cut api p95 latency below 300ms this week.'),
      ('emeka@nexus.demo|2|2', 'emeka@nexus.demo', 2, 'Add keyboard navigation to the commitment list', 'frontend', 'critical', 'delivered', false, 'none', null, true, null, 7.00, 6.00, 'Finished add keyboard navigation to the commitment list this week.'),
      ('emeka@nexus.demo|2|3', 'emeka@nexus.demo', 2, 'Rotate the production credentials', 'infra', 'normal', 'partial', false, 'none', null, true, null, 6.00, 6.70, 'Planning to rotate the production credentials.'),
      ('emeka@nexus.demo|2|4', 'emeka@nexus.demo', 2, 'Rebuild the department drill-down view', 'frontend', 'normal', 'deferred', true, 'none', null, true, null, 6.00, null, 'Planning to rebuild the department drill-down view.'),
      ('emeka@nexus.demo|3|0', 'emeka@nexus.demo', 3, 'Move session storage off the primary database', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 8.10, 'Finished move session storage off the primary database this week.'),
      ('emeka@nexus.demo|3|1', 'emeka@nexus.demo', 3, 'Add keyboard navigation to the commitment list', 'frontend', 'high', 'partial', false, 'none', null, true, null, 6.00, 6.70, 'Planning to add keyboard navigation to the commitment list.'),
      ('emeka@nexus.demo|3|2', 'emeka@nexus.demo', 3, 'Add retry + backoff to the webhook dispatcher', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 13.70, 'Finished add retry + backoff to the webhook dispatcher this week.'),
      ('emeka@nexus.demo|3|3', 'emeka@nexus.demo', 3, 'Rebuild the department drill-down view', 'frontend', 'high', 'delivered', false, 'none', null, true, null, 7.00, 6.30, 'Finished rebuild the department drill-down view this week.'),
      ('emeka@nexus.demo|3|4', 'emeka@nexus.demo', 3, 'Fix layout shift on the dashboard header', 'frontend', 'critical', 'delivered', false, 'none', null, true, null, 11.00, 12.60, 'Finished fix layout shift on the dashboard header this week.'),
      ('emeka@nexus.demo|4|0', 'emeka@nexus.demo', 4, 'Set up alerting for failed background jobs', 'infra', 'normal', 'partial', true, 'none', null, true, null, 11.00, 9.60, 'Planning to set up alerting for failed background jobs.'),
      ('emeka@nexus.demo|4|1', 'emeka@nexus.demo', 4, 'Fix layout shift on the dashboard header', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 3.00, 2.70, 'Finished fix layout shift on the dashboard header this week.'),
      ('emeka@nexus.demo|4|2', 'emeka@nexus.demo', 4, 'Rotate the production credentials', 'infra', 'normal', 'in_progress', false, 'none', null, true, null, 13.00, null, 'Planning to rotate the production credentials.'),
      ('emeka@nexus.demo|4|3', 'emeka@nexus.demo', 4, 'Move session storage off the primary database', 'backend', 'normal', 'partial', true, 'none', null, true, null, 4.00, 3.50, 'Planning to move session storage off the primary database.'),
      ('emeka@nexus.demo|5|0', 'emeka@nexus.demo', 5, 'Move session storage off the primary database', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 5.60, 'Finished move session storage off the primary database this week.'),
      ('emeka@nexus.demo|5|1', 'emeka@nexus.demo', 5, 'Harden the inbound email parser against malformed MIME', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 6.20, 'Finished harden the inbound email parser against malformed mime this week.'),
      ('emeka@nexus.demo|5|2', 'emeka@nexus.demo', 5, 'Add retry + backoff to the webhook dispatcher', 'backend', 'normal', 'partial', false, 'none', null, true, null, 12.00, 12.40, 'Planning to add retry + backoff to the webhook dispatcher.'),
      ('emeka@nexus.demo|5|3', 'emeka@nexus.demo', 5, 'Add keyboard navigation to the commitment list', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 8.70, 'Finished add keyboard navigation to the commitment list this week.'),
      ('emeka@nexus.demo|6|0', 'emeka@nexus.demo', 6, 'Add keyboard navigation to the commitment list', 'frontend', 'normal', 'partial', true, 'none', null, true, null, 3.00, 3.40, 'Planning to add keyboard navigation to the commitment list.'),
      ('emeka@nexus.demo|6|1', 'emeka@nexus.demo', 6, 'Cut API p95 latency below 300ms', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 9.10, 'Finished cut api p95 latency below 300ms this week.'),
      ('emeka@nexus.demo|6|2', 'emeka@nexus.demo', 6, 'Roll staging onto the new deployment pipeline', 'infra', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 7.20, 'Finished roll staging onto the new deployment pipeline this week.'),
      ('emeka@nexus.demo|6|3', 'emeka@nexus.demo', 6, 'Add retry + backoff to the webhook dispatcher', 'backend', 'critical', 'partial', true, 'none', null, true, null, 11.00, 12.50, 'Planning to add retry + backoff to the webhook dispatcher.'),
      ('emeka@nexus.demo|7|0', 'emeka@nexus.demo', 7, 'Cut API p95 latency below 300ms', 'backend', 'high', 'delivered', false, 'none', null, true, null, 11.00, 9.40, 'Finished cut api p95 latency below 300ms this week.'),
      ('emeka@nexus.demo|7|1', 'emeka@nexus.demo', 7, 'Fix layout shift on the dashboard header', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 12.10, 'Finished fix layout shift on the dashboard header this week.'),
      ('emeka@nexus.demo|7|2', 'emeka@nexus.demo', 7, 'Harden the inbound email parser against malformed MIME', 'backend', 'high', 'delivered', false, 'none', null, true, null, 11.00, 10.80, 'Finished harden the inbound email parser against malformed mime this week.'),
      ('fatima@nexus.demo|0|0', 'fatima@nexus.demo', 0, 'Roll staging onto the new deployment pipeline', 'infra', 'normal', 'deferred', true, 'none', null, true, null, 9.00, null, 'Planning to roll staging onto the new deployment pipeline.'),
      ('fatima@nexus.demo|0|1', 'fatima@nexus.demo', 0, 'Add retry + backoff to the webhook dispatcher', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 12.30, 'Finished add retry + backoff to the webhook dispatcher this week.'),
      ('fatima@nexus.demo|0|2', 'fatima@nexus.demo', 0, 'Move session storage off the primary database', 'backend', 'normal', 'partial', true, 'none', null, true, null, 11.00, 10.80, 'Planning to move session storage off the primary database.'),
      ('fatima@nexus.demo|1|0', 'fatima@nexus.demo', 1, 'Move session storage off the primary database', 'backend', 'high', 'delivered', false, 'none', null, true, null, 10.00, 9.20, 'Finished move session storage off the primary database this week.'),
      ('fatima@nexus.demo|1|1', 'fatima@nexus.demo', 1, 'Rebuild the department drill-down view', 'frontend', 'normal', 'in_progress', false, 'none', null, true, null, 9.00, null, 'Planning to rebuild the department drill-down view.'),
      ('fatima@nexus.demo|1|2', 'fatima@nexus.demo', 1, 'Cut API p95 latency below 300ms', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 7.20, 'Finished cut api p95 latency below 300ms this week.'),
      ('fatima@nexus.demo|1|3', 'fatima@nexus.demo', 1, 'Roll staging onto the new deployment pipeline', 'infra', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.40, 'Finished roll staging onto the new deployment pipeline this week.'),
      ('fatima@nexus.demo|2|0', 'fatima@nexus.demo', 2, 'Rebuild the department drill-down view', 'frontend', 'high', 'delivered', false, 'none', null, true, null, 6.00, 6.30, 'Finished rebuild the department drill-down view this week.'),
      ('fatima@nexus.demo|2|1', 'fatima@nexus.demo', 2, 'Roll staging onto the new deployment pipeline', 'infra', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 4.50, 'Finished roll staging onto the new deployment pipeline this week.'),
      ('fatima@nexus.demo|2|2', 'fatima@nexus.demo', 2, 'Add keyboard navigation to the commitment list', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 6.70, 'Finished add keyboard navigation to the commitment list this week.'),
      ('fatima@nexus.demo|2|3', 'fatima@nexus.demo', 2, 'Ship the commitment reconciliation endpoint', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.30, 'Finished ship the commitment reconciliation endpoint this week.'),
      ('fatima@nexus.demo|3|0', 'fatima@nexus.demo', 3, 'Rotate the production credentials', 'infra', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 6.10, 'Finished rotate the production credentials this week.'),
      ('fatima@nexus.demo|3|1', 'fatima@nexus.demo', 3, 'Add keyboard navigation to the commitment list', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 13.20, 'Finished add keyboard navigation to the commitment list this week.'),
      ('fatima@nexus.demo|3|2', 'fatima@nexus.demo', 3, 'Move session storage off the primary database', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 9.80, 'Finished move session storage off the primary database this week.'),
      ('fatima@nexus.demo|3|3', 'fatima@nexus.demo', 3, 'Add retry + backoff to the webhook dispatcher', 'backend', 'normal', 'partial', true, 'none', null, true, null, 4.00, 3.70, 'Planning to add retry + backoff to the webhook dispatcher.'),
      ('fatima@nexus.demo|3|4', 'fatima@nexus.demo', 3, 'Cut API p95 latency below 300ms', 'backend', 'high', 'delivered', false, 'none', null, true, null, 6.00, 5.60, 'Finished cut api p95 latency below 300ms this week.'),
      ('fatima@nexus.demo|4|0', 'fatima@nexus.demo', 4, 'Cut API p95 latency below 300ms', 'backend', 'normal', 'dropped', false, 'none', null, true, null, 12.00, null, 'Planning to cut api p95 latency below 300ms.'),
      ('fatima@nexus.demo|4|1', 'fatima@nexus.demo', 4, 'Add keyboard navigation to the commitment list', 'frontend', 'normal', 'deferred', true, 'none', null, true, null, 5.00, null, 'Planning to add keyboard navigation to the commitment list.'),
      ('fatima@nexus.demo|4|2', 'fatima@nexus.demo', 4, 'Fix layout shift on the dashboard header', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 10.30, 'Finished fix layout shift on the dashboard header this week.'),
      ('fatima@nexus.demo|4|3', 'fatima@nexus.demo', 4, 'Roll staging onto the new deployment pipeline', 'infra', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 4.40, 'Finished roll staging onto the new deployment pipeline this week.'),
      ('fatima@nexus.demo|5|0', 'fatima@nexus.demo', 5, 'Harden the inbound email parser against malformed MIME', 'backend', 'normal', 'partial', false, 'none', null, true, null, 6.00, 6.80, 'Planning to harden the inbound email parser against malformed mime.'),
      ('fatima@nexus.demo|5|1', 'fatima@nexus.demo', 5, 'Fix layout shift on the dashboard header', 'frontend', 'normal', 'partial', false, 'none', null, true, null, 7.00, 6.70, 'Planning to fix layout shift on the dashboard header.'),
      ('fatima@nexus.demo|5|2', 'fatima@nexus.demo', 5, 'Set up alerting for failed background jobs', 'infra', 'high', 'in_progress', false, 'none', null, true, null, 9.00, null, 'Planning to set up alerting for failed background jobs.'),
      ('fatima@nexus.demo|6|0', 'fatima@nexus.demo', 6, 'Fix layout shift on the dashboard header', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 7.90, 'Finished fix layout shift on the dashboard header this week.'),
      ('fatima@nexus.demo|6|1', 'fatima@nexus.demo', 6, 'Rebuild the department drill-down view', 'frontend', 'normal', 'partial', false, 'none', null, true, null, 4.00, 4.20, 'Planning to rebuild the department drill-down view.'),
      ('fatima@nexus.demo|6|2', 'fatima@nexus.demo', 6, 'Add retry + backoff to the webhook dispatcher', 'backend', 'normal', 'partial', true, 'none', null, true, null, 12.00, 12.70, 'Planning to add retry + backoff to the webhook dispatcher.'),
      ('fatima@nexus.demo|6|3', 'fatima@nexus.demo', 6, 'Set up alerting for failed background jobs', 'infra', 'normal', 'deferred', false, 'none', null, true, null, 8.00, null, 'Planning to set up alerting for failed background jobs.'),
      ('fatima@nexus.demo|7|0', 'fatima@nexus.demo', 7, 'Add keyboard navigation to the commitment list', 'frontend', 'normal', 'dropped', false, 'none', null, true, null, 4.00, null, 'Planning to add keyboard navigation to the commitment list.'),
      ('fatima@nexus.demo|7|1', 'fatima@nexus.demo', 7, 'Ship the commitment reconciliation endpoint', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 7.00, 'Finished ship the commitment reconciliation endpoint this week.'),
      ('fatima@nexus.demo|7|2', 'fatima@nexus.demo', 7, 'Rebuild the department drill-down view', 'frontend', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 3.50, 'Finished rebuild the department drill-down view this week.'),
      ('fatima@nexus.demo|7|3', 'fatima@nexus.demo', 7, 'Add retry + backoff to the webhook dispatcher', 'backend', 'normal', 'partial', true, 'none', null, true, null, 9.00, 9.10, 'Planning to add retry + backoff to the webhook dispatcher.'),
      ('tunde@nexus.demo|0|0', 'tunde@nexus.demo', 0, 'Rebuild the podcast publishing checklist', 'production', 'high', 'dropped', false, 'none', null, true, null, 3.00, null, 'Planning to rebuild the podcast publishing checklist.'),
      ('tunde@nexus.demo|0|1', 'tunde@nexus.demo', 0, 'Cut the Q3 client showreel', 'production', 'normal', 'partial', true, 'none', null, true, null, 4.00, 4.00, 'Planning to cut the q3 client showreel.'),
      ('tunde@nexus.demo|0|2', 'tunde@nexus.demo', 0, 'Record and edit three founder interviews', 'production', 'normal', 'partial', false, 'none', null, true, null, 8.00, 8.80, 'Planning to record and edit three founder interviews.'),
      ('tunde@nexus.demo|0|3', 'tunde@nexus.demo', 0, 'Draft five channel scripts for the product launch', 'editorial', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 4.40, 'Finished draft five channel scripts for the product launch this week.'),
      ('tunde@nexus.demo|1|0', 'tunde@nexus.demo', 1, 'Deliver the campaign launch film', 'production', 'normal', 'dropped', false, 'none', null, true, null, 8.00, null, 'Planning to deliver the campaign launch film.'),
      ('tunde@nexus.demo|1|1', 'tunde@nexus.demo', 1, 'Publish the September editorial calendar', 'editorial', 'normal', 'dropped', false, 'none', null, true, null, 14.00, null, 'Planning to publish the september editorial calendar.'),
      ('tunde@nexus.demo|1|2', 'tunde@nexus.demo', 1, 'Draft five channel scripts for the product launch', 'editorial', 'normal', 'deferred', false, 'none', null, true, null, 4.00, null, 'Planning to draft five channel scripts for the product launch.'),
      ('tunde@nexus.demo|1|3', 'tunde@nexus.demo', 1, 'Cut the Q3 client showreel', 'production', 'high', 'deferred', false, 'none', null, true, null, 3.00, null, 'Planning to cut the q3 client showreel.'),
      ('tunde@nexus.demo|1|4', 'tunde@nexus.demo', 1, 'Close out captions and subtitles for the archive', 'editorial', 'high', 'partial', false, 'none', null, true, null, 3.00, 3.30, 'Planning to close out captions and subtitles for the archive.'),
      ('tunde@nexus.demo|2|0', 'tunde@nexus.demo', 2, 'Record and edit three founder interviews', 'production', 'normal', 'dropped', false, 'none', null, true, null, 6.00, null, 'Planning to record and edit three founder interviews.'),
      ('tunde@nexus.demo|2|1', 'tunde@nexus.demo', 2, 'Close out captions and subtitles for the archive', 'editorial', 'normal', 'dropped', true, 'none', null, true, null, 10.00, null, 'Planning to close out captions and subtitles for the archive.'),
      ('tunde@nexus.demo|2|2', 'tunde@nexus.demo', 2, 'Draft five channel scripts for the product launch', 'editorial', 'normal', 'partial', true, 'none', null, true, null, 9.00, 9.10, 'Planning to draft five channel scripts for the product launch.'),
      ('tunde@nexus.demo|2|3', 'tunde@nexus.demo', 2, 'Rebuild the podcast publishing checklist', 'production', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 6.40, 'Finished rebuild the podcast publishing checklist this week.'),
      ('tunde@nexus.demo|2|4', 'tunde@nexus.demo', 2, 'Deliver the campaign launch film', 'production', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 10.20, 'Finished deliver the campaign launch film this week.'),
      ('tunde@nexus.demo|3|0', 'tunde@nexus.demo', 3, 'Cut the Q3 client showreel', 'production', 'high', 'dropped', false, 'none', null, true, null, 13.00, null, 'Planning to cut the q3 client showreel.'),
      ('tunde@nexus.demo|3|1', 'tunde@nexus.demo', 3, 'Rebuild the podcast publishing checklist', 'production', 'normal', 'partial', true, 'none', null, true, null, 7.00, 7.50, 'Planning to rebuild the podcast publishing checklist.'),
      ('tunde@nexus.demo|3|2', 'tunde@nexus.demo', 3, 'Deliver the campaign launch film', 'production', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.60, 'Finished deliver the campaign launch film this week.'),
      ('tunde@nexus.demo|4|0', 'tunde@nexus.demo', 4, 'Rebuild the podcast publishing checklist', 'production', 'normal', 'dropped', false, 'none', null, true, null, 7.00, null, 'Planning to rebuild the podcast publishing checklist.'),
      ('tunde@nexus.demo|4|1', 'tunde@nexus.demo', 4, 'Record and edit three founder interviews', 'production', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 12.80, 'Finished record and edit three founder interviews this week.'),
      ('tunde@nexus.demo|4|2', 'tunde@nexus.demo', 4, 'Publish the September editorial calendar', 'editorial', 'normal', 'delivered', false, 'none', null, true, null, 3.00, 2.70, 'Finished publish the september editorial calendar this week.'),
      ('tunde@nexus.demo|4|3', 'tunde@nexus.demo', 4, 'Cut the Q3 client showreel', 'production', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.30, 'Finished cut the q3 client showreel this week.'),
      ('tunde@nexus.demo|5|0', 'tunde@nexus.demo', 5, 'Rebuild the podcast publishing checklist', 'production', 'normal', 'dropped', false, 'none', null, true, null, 3.00, null, 'Planning to rebuild the podcast publishing checklist.'),
      ('tunde@nexus.demo|5|1', 'tunde@nexus.demo', 5, 'Publish the September editorial calendar', 'editorial', 'normal', 'deferred', true, 'none', null, true, null, 6.00, null, 'Planning to publish the september editorial calendar.'),
      ('tunde@nexus.demo|5|2', 'tunde@nexus.demo', 5, 'Draft five channel scripts for the product launch', 'editorial', 'normal', 'in_progress', true, 'none', null, true, null, 8.00, null, 'Planning to draft five channel scripts for the product launch.'),
      ('tunde@nexus.demo|5|3', 'tunde@nexus.demo', 5, 'Deliver the campaign launch film', 'production', 'high', 'delivered', false, 'none', null, true, null, 12.00, 13.20, 'Finished deliver the campaign launch film this week.'),
      ('tunde@nexus.demo|6|0', 'tunde@nexus.demo', 6, 'Close out captions and subtitles for the archive', 'editorial', 'normal', 'dropped', false, 'none', null, true, null, 9.00, null, 'Planning to close out captions and subtitles for the archive.'),
      ('tunde@nexus.demo|6|1', 'tunde@nexus.demo', 6, 'Publish the September editorial calendar', 'editorial', 'high', 'delivered', false, 'none', null, true, null, 9.00, 9.40, 'Finished publish the september editorial calendar this week.'),
      ('tunde@nexus.demo|6|2', 'tunde@nexus.demo', 6, 'Rebuild the podcast publishing checklist', 'production', 'normal', 'in_progress', true, 'none', null, true, null, 8.00, null, 'Planning to rebuild the podcast publishing checklist.'),
      ('tunde@nexus.demo|7|0', 'tunde@nexus.demo', 7, 'Close out captions and subtitles for the archive', 'editorial', 'normal', 'dropped', false, 'none', null, true, null, 5.00, null, 'Planning to close out captions and subtitles for the archive.'),
      ('tunde@nexus.demo|7|1', 'tunde@nexus.demo', 7, 'Draft five channel scripts for the product launch', 'editorial', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 11.30, 'Finished draft five channel scripts for the product launch this week.'),
      ('tunde@nexus.demo|7|2', 'tunde@nexus.demo', 7, 'Publish the September editorial calendar', 'editorial', 'normal', 'in_progress', true, 'none', null, true, null, 9.00, null, 'Planning to publish the september editorial calendar.'),
      ('tunde@nexus.demo|7|3', 'tunde@nexus.demo', 7, 'Rebuild the podcast publishing checklist', 'production', 'normal', 'partial', true, 'none', null, true, null, 11.00, 12.40, 'Planning to rebuild the podcast publishing checklist.'),
      ('ngozi@nexus.demo|0|0', 'ngozi@nexus.demo', 0, 'Record and edit three founder interviews', 'production', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 11.90, 'Finished record and edit three founder interviews this week.'),
      ('ngozi@nexus.demo|0|1', 'ngozi@nexus.demo', 0, 'Cut the Q3 client showreel', 'production', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 11.30, 'Finished cut the q3 client showreel this week.'),
      ('ngozi@nexus.demo|0|2', 'ngozi@nexus.demo', 0, 'Publish the September editorial calendar', 'editorial', 'high', 'deferred', true, 'none', null, true, null, 5.00, null, 'Planning to publish the september editorial calendar.'),
      ('ngozi@nexus.demo|1|0', 'ngozi@nexus.demo', 1, 'Record and edit three founder interviews', 'production', 'critical', 'deferred', true, 'none', null, true, null, 5.00, null, 'Planning to record and edit three founder interviews.'),
      ('ngozi@nexus.demo|1|1', 'ngozi@nexus.demo', 1, 'Draft five channel scripts for the product launch', 'editorial', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 10.50, 'Finished draft five channel scripts for the product launch this week.'),
      ('ngozi@nexus.demo|1|2', 'ngozi@nexus.demo', 1, 'Deliver the campaign launch film', 'production', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 8.80, 'Finished deliver the campaign launch film this week.'),
      ('ngozi@nexus.demo|1|3', 'ngozi@nexus.demo', 1, 'Rebuild the podcast publishing checklist', 'production', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 9.00, 'Finished rebuild the podcast publishing checklist this week.'),
      ('ngozi@nexus.demo|2|0', 'ngozi@nexus.demo', 2, 'Record and edit three founder interviews', 'production', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 6.10, 'Finished record and edit three founder interviews this week.'),
      ('ngozi@nexus.demo|2|1', 'ngozi@nexus.demo', 2, 'Rebuild the podcast publishing checklist', 'production', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 4.90, 'Finished rebuild the podcast publishing checklist this week.'),
      ('ngozi@nexus.demo|2|2', 'ngozi@nexus.demo', 2, 'Publish the September editorial calendar', 'editorial', 'critical', 'delivered', false, 'none', null, true, null, 10.00, 10.30, 'Finished publish the september editorial calendar this week.'),
      ('ngozi@nexus.demo|3|0', 'ngozi@nexus.demo', 3, 'Draft five channel scripts for the product launch', 'editorial', 'normal', 'deferred', true, 'none', null, true, null, 12.00, null, 'Planning to draft five channel scripts for the product launch.'),
      ('ngozi@nexus.demo|3|1', 'ngozi@nexus.demo', 3, 'Record and edit three founder interviews', 'production', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 9.70, 'Finished record and edit three founder interviews this week.'),
      ('ngozi@nexus.demo|3|2', 'ngozi@nexus.demo', 3, 'Deliver the campaign launch film', 'production', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 11.30, 'Finished deliver the campaign launch film this week.'),
      ('ngozi@nexus.demo|4|0', 'ngozi@nexus.demo', 4, 'Cut the Q3 client showreel', 'production', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 8.10, 'Finished cut the q3 client showreel this week.'),
      ('ngozi@nexus.demo|4|1', 'ngozi@nexus.demo', 4, 'Rebuild the podcast publishing checklist', 'production', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 4.40, 'Finished rebuild the podcast publishing checklist this week.'),
      ('ngozi@nexus.demo|4|2', 'ngozi@nexus.demo', 4, 'Deliver the campaign launch film', 'production', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 11.50, 'Finished deliver the campaign launch film this week.'),
      ('ngozi@nexus.demo|4|3', 'ngozi@nexus.demo', 4, 'Draft five channel scripts for the product launch', 'editorial', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 7.50, 'Finished draft five channel scripts for the product launch this week.'),
      ('ngozi@nexus.demo|5|0', 'ngozi@nexus.demo', 5, 'Publish the September editorial calendar', 'editorial', 'critical', 'delivered', false, 'none', null, true, null, 14.00, 12.40, 'Finished publish the september editorial calendar this week.'),
      ('ngozi@nexus.demo|5|1', 'ngozi@nexus.demo', 5, 'Cut the Q3 client showreel', 'production', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 4.00, 'Finished cut the q3 client showreel this week.'),
      ('ngozi@nexus.demo|5|2', 'ngozi@nexus.demo', 5, 'Deliver the campaign launch film', 'production', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 7.40, 'Finished deliver the campaign launch film this week.'),
      ('ngozi@nexus.demo|6|0', 'ngozi@nexus.demo', 6, 'Close out captions and subtitles for the archive', 'editorial', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 9.20, 'Finished close out captions and subtitles for the archive this week.'),
      ('ngozi@nexus.demo|6|1', 'ngozi@nexus.demo', 6, 'Record and edit three founder interviews', 'production', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 6.80, 'Finished record and edit three founder interviews this week.'),
      ('ngozi@nexus.demo|6|2', 'ngozi@nexus.demo', 6, 'Publish the September editorial calendar', 'editorial', 'normal', 'deferred', true, 'none', null, true, null, 12.00, null, 'Planning to publish the september editorial calendar.'),
      ('ngozi@nexus.demo|6|3', 'ngozi@nexus.demo', 6, 'Draft five channel scripts for the product launch', 'editorial', 'high', 'deferred', true, 'none', null, true, null, 7.00, null, 'Planning to draft five channel scripts for the product launch.'),
      ('ngozi@nexus.demo|7|0', 'ngozi@nexus.demo', 7, 'Close out captions and subtitles for the archive', 'editorial', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 4.40, 'Finished close out captions and subtitles for the archive this week.'),
      ('ngozi@nexus.demo|7|1', 'ngozi@nexus.demo', 7, 'Rebuild the podcast publishing checklist', 'production', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 9.80, 'Finished rebuild the podcast publishing checklist this week.'),
      ('ngozi@nexus.demo|7|2', 'ngozi@nexus.demo', 7, 'Cut the Q3 client showreel', 'production', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.50, 'Finished cut the q3 client showreel this week.'),
      ('ngozi@nexus.demo|7|3', 'ngozi@nexus.demo', 7, 'Publish the September editorial calendar', 'editorial', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 11.70, 'Finished publish the september editorial calendar this week.'),
      ('yusuf@nexus.demo|0|0', 'yusuf@nexus.demo', 0, 'Publish the September editorial calendar', 'editorial', 'normal', 'in_progress', false, 'none', null, true, null, 13.00, null, 'Planning to publish the september editorial calendar.'),
      ('yusuf@nexus.demo|0|1', 'yusuf@nexus.demo', 0, 'Cut the Q3 client showreel', 'production', 'normal', 'deferred', true, 'none', null, true, null, 6.00, null, 'Planning to cut the q3 client showreel.'),
      ('yusuf@nexus.demo|0|2', 'yusuf@nexus.demo', 0, 'Record and edit three founder interviews', 'production', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 3.80, 'Finished record and edit three founder interviews this week.'),
      ('yusuf@nexus.demo|0|3', 'yusuf@nexus.demo', 0, 'Rebuild the podcast publishing checklist', 'production', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 6.90, 'Finished rebuild the podcast publishing checklist this week.'),
      ('yusuf@nexus.demo|0|4', 'yusuf@nexus.demo', 0, 'Deliver the campaign launch film', 'production', 'high', 'dropped', false, 'none', null, true, null, 6.00, null, 'Planning to deliver the campaign launch film.'),
      ('yusuf@nexus.demo|1|0', 'yusuf@nexus.demo', 1, 'Deliver the campaign launch film', 'production', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 3.80, 'Finished deliver the campaign launch film this week.'),
      ('yusuf@nexus.demo|1|1', 'yusuf@nexus.demo', 1, 'Draft five channel scripts for the product launch', 'editorial', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.70, 'Finished draft five channel scripts for the product launch this week.'),
      ('yusuf@nexus.demo|1|2', 'yusuf@nexus.demo', 1, 'Cut the Q3 client showreel', 'production', 'normal', 'dropped', false, 'none', null, true, null, 8.00, null, 'Planning to cut the q3 client showreel.'),
      ('yusuf@nexus.demo|1|3', 'yusuf@nexus.demo', 1, 'Publish the September editorial calendar', 'editorial', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 3.50, 'Finished publish the september editorial calendar this week.'),
      ('yusuf@nexus.demo|2|0', 'yusuf@nexus.demo', 2, 'Record and edit three founder interviews', 'production', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 7.00, 'Finished record and edit three founder interviews this week.'),
      ('yusuf@nexus.demo|2|1', 'yusuf@nexus.demo', 2, 'Deliver the campaign launch film', 'production', 'normal', 'in_progress', true, 'none', null, true, null, 6.00, null, 'Planning to deliver the campaign launch film.'),
      ('yusuf@nexus.demo|2|2', 'yusuf@nexus.demo', 2, 'Draft five channel scripts for the product launch', 'editorial', 'high', 'partial', false, 'none', null, true, null, 12.00, 12.30, 'Planning to draft five channel scripts for the product launch.'),
      ('yusuf@nexus.demo|3|0', 'yusuf@nexus.demo', 3, 'Record and edit three founder interviews', 'production', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 7.10, 'Finished record and edit three founder interviews this week.'),
      ('yusuf@nexus.demo|3|1', 'yusuf@nexus.demo', 3, 'Rebuild the podcast publishing checklist', 'production', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 11.80, 'Finished rebuild the podcast publishing checklist this week.'),
      ('yusuf@nexus.demo|3|2', 'yusuf@nexus.demo', 3, 'Publish the September editorial calendar', 'editorial', 'critical', 'delivered', false, 'none', null, true, null, 10.00, 9.30, 'Finished publish the september editorial calendar this week.'),
      ('yusuf@nexus.demo|3|3', 'yusuf@nexus.demo', 3, 'Cut the Q3 client showreel', 'production', 'critical', 'deferred', false, 'none', null, true, null, 3.00, null, 'Planning to cut the q3 client showreel.'),
      ('yusuf@nexus.demo|4|0', 'yusuf@nexus.demo', 4, 'Publish the September editorial calendar', 'editorial', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 12.30, 'Finished publish the september editorial calendar this week.'),
      ('yusuf@nexus.demo|4|1', 'yusuf@nexus.demo', 4, 'Draft five channel scripts for the product launch', 'editorial', 'normal', 'partial', true, 'none', null, true, null, 4.00, 3.80, 'Planning to draft five channel scripts for the product launch.'),
      ('yusuf@nexus.demo|4|2', 'yusuf@nexus.demo', 4, 'Rebuild the podcast publishing checklist', 'production', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 7.80, 'Finished rebuild the podcast publishing checklist this week.'),
      ('yusuf@nexus.demo|4|3', 'yusuf@nexus.demo', 4, 'Record and edit three founder interviews', 'production', 'normal', 'partial', true, 'none', null, true, null, 12.00, 10.30, 'Planning to record and edit three founder interviews.'),
      ('yusuf@nexus.demo|5|0', 'yusuf@nexus.demo', 5, 'Rebuild the podcast publishing checklist', 'production', 'normal', 'partial', true, 'none', null, true, null, 9.00, 10.20, 'Planning to rebuild the podcast publishing checklist.'),
      ('yusuf@nexus.demo|5|1', 'yusuf@nexus.demo', 5, 'Close out captions and subtitles for the archive', 'editorial', 'normal', 'dropped', false, 'none', null, true, null, 13.00, null, 'Planning to close out captions and subtitles for the archive.'),
      ('yusuf@nexus.demo|5|2', 'yusuf@nexus.demo', 5, 'Publish the September editorial calendar', 'editorial', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 9.00, 'Finished publish the september editorial calendar this week.'),
      ('yusuf@nexus.demo|5|3', 'yusuf@nexus.demo', 5, 'Record and edit three founder interviews', 'production', 'high', 'dropped', true, 'none', null, true, null, 4.00, null, 'Planning to record and edit three founder interviews.'),
      ('yusuf@nexus.demo|6|0', 'yusuf@nexus.demo', 6, 'Close out captions and subtitles for the archive', 'editorial', 'normal', 'in_progress', true, 'none', null, true, null, 3.00, null, 'Planning to close out captions and subtitles for the archive.'),
      ('yusuf@nexus.demo|6|1', 'yusuf@nexus.demo', 6, 'Publish the September editorial calendar', 'editorial', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 7.70, 'Finished publish the september editorial calendar this week.'),
      ('yusuf@nexus.demo|6|2', 'yusuf@nexus.demo', 6, 'Record and edit three founder interviews', 'production', 'normal', 'partial', true, 'none', null, true, null, 10.00, 8.60, 'Planning to record and edit three founder interviews.'),
      ('yusuf@nexus.demo|6|3', 'yusuf@nexus.demo', 6, 'Deliver the campaign launch film', 'production', 'normal', 'partial', true, 'none', null, true, null, 7.00, 6.70, 'Planning to deliver the campaign launch film.'),
      ('yusuf@nexus.demo|7|0', 'yusuf@nexus.demo', 7, 'Cut the Q3 client showreel', 'production', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 3.70, 'Finished cut the q3 client showreel this week.'),
      ('yusuf@nexus.demo|7|1', 'yusuf@nexus.demo', 7, 'Draft five channel scripts for the product launch', 'editorial', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 10.10, 'Finished draft five channel scripts for the product launch this week.'),
      ('yusuf@nexus.demo|7|2', 'yusuf@nexus.demo', 7, 'Close out captions and subtitles for the archive', 'editorial', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 9.20, 'Finished close out captions and subtitles for the archive this week.'),
      ('adaeze@nexus.demo|0|0', 'adaeze@nexus.demo', 0, 'Rewrite onboarding email sequence', 'copy', 'normal', 'partial', false, 'none', null, true, null, 12.00, 13.60, 'Planning to rewrite onboarding email sequence.'),
      ('adaeze@nexus.demo|0|1', 'adaeze@nexus.demo', 0, 'Deliver the rebrand key visuals', 'design', 'normal', 'delivered', false, 'none', null, true, null, 3.00, 3.40, 'Finished deliver the rebrand key visuals this week.'),
      ('adaeze@nexus.demo|0|2', 'adaeze@nexus.demo', 0, 'Finish the design token documentation', 'design', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.10, 'Finished finish the design token documentation this week.'),
      ('adaeze@nexus.demo|1|0', 'adaeze@nexus.demo', 1, 'Name and position the new service line', 'copy', 'normal', 'in_progress', true, 'none', null, true, null, 9.00, null, 'Planning to name and position the new service line.'),
      ('adaeze@nexus.demo|1|1', 'adaeze@nexus.demo', 1, 'Refresh the pitch deck template', 'design', 'normal', 'partial', true, 'none', null, true, null, 9.00, 10.00, 'Planning to refresh the pitch deck template.'),
      ('adaeze@nexus.demo|1|2', 'adaeze@nexus.demo', 1, 'Write the landing page copy', 'copy', 'high', 'deferred', true, 'none', null, true, null, 10.00, null, 'Planning to write the landing page copy.'),
      ('adaeze@nexus.demo|2|0', 'adaeze@nexus.demo', 2, 'Refresh the pitch deck template', 'design', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 7.10, 'Finished refresh the pitch deck template this week.'),
      ('adaeze@nexus.demo|2|1', 'adaeze@nexus.demo', 2, 'Name and position the new service line', 'copy', 'normal', 'delivered', false, 'none', null, true, null, 3.00, 2.80, 'Finished name and position the new service line this week.'),
      ('adaeze@nexus.demo|2|2', 'adaeze@nexus.demo', 2, 'Finish the design token documentation', 'design', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.60, 'Finished finish the design token documentation this week.'),
      ('adaeze@nexus.demo|2|3', 'adaeze@nexus.demo', 2, 'Deliver the rebrand key visuals', 'design', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 10.70, 'Finished deliver the rebrand key visuals this week.'),
      ('adaeze@nexus.demo|3|0', 'adaeze@nexus.demo', 3, 'Produce campaign assets for the launch', 'design', 'normal', 'delivered', false, 'none', null, true, null, 3.00, 2.60, 'Finished produce campaign assets for the launch this week.'),
      ('adaeze@nexus.demo|3|1', 'adaeze@nexus.demo', 3, 'Finish the design token documentation', 'design', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 10.80, 'Finished finish the design token documentation this week.'),
      ('adaeze@nexus.demo|3|2', 'adaeze@nexus.demo', 3, 'Refresh the pitch deck template', 'design', 'high', 'partial', false, 'none', null, true, null, 4.00, 3.50, 'Planning to refresh the pitch deck template.'),
      ('adaeze@nexus.demo|3|3', 'adaeze@nexus.demo', 3, 'Write the landing page copy', 'copy', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 11.40, 'Finished write the landing page copy this week.'),
      ('adaeze@nexus.demo|4|0', 'adaeze@nexus.demo', 4, 'Write the landing page copy', 'copy', 'normal', 'partial', false, 'none', null, true, null, 12.00, 10.80, 'Planning to write the landing page copy.'),
      ('adaeze@nexus.demo|4|1', 'adaeze@nexus.demo', 4, 'Refresh the pitch deck template', 'design', 'normal', 'partial', false, 'none', null, true, null, 4.00, 4.40, 'Planning to refresh the pitch deck template.'),
      ('adaeze@nexus.demo|4|2', 'adaeze@nexus.demo', 4, 'Rewrite onboarding email sequence', 'copy', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 12.40, 'Finished rewrite onboarding email sequence this week.'),
      ('adaeze@nexus.demo|4|3', 'adaeze@nexus.demo', 4, 'Deliver the rebrand key visuals', 'design', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 7.20, 'Finished deliver the rebrand key visuals this week.'),
      ('adaeze@nexus.demo|5|0', 'adaeze@nexus.demo', 5, 'Refresh the pitch deck template', 'design', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 9.40, 'Finished refresh the pitch deck template this week.'),
      ('adaeze@nexus.demo|5|1', 'adaeze@nexus.demo', 5, 'Name and position the new service line', 'copy', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 13.30, 'Finished name and position the new service line this week.'),
      ('adaeze@nexus.demo|5|2', 'adaeze@nexus.demo', 5, 'Rewrite onboarding email sequence', 'copy', 'normal', 'partial', false, 'none', null, true, null, 6.00, 5.60, 'Planning to rewrite onboarding email sequence.'),
      ('adaeze@nexus.demo|6|0', 'adaeze@nexus.demo', 6, 'Refresh the pitch deck template', 'design', 'normal', 'in_progress', true, 'none', null, true, null, 8.00, null, 'Planning to refresh the pitch deck template.'),
      ('adaeze@nexus.demo|6|1', 'adaeze@nexus.demo', 6, 'Name and position the new service line', 'copy', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 5.80, 'Finished name and position the new service line this week.'),
      ('adaeze@nexus.demo|6|2', 'adaeze@nexus.demo', 6, 'Finish the design token documentation', 'design', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 12.30, 'Finished finish the design token documentation this week.'),
      ('adaeze@nexus.demo|6|3', 'adaeze@nexus.demo', 6, 'Deliver the rebrand key visuals', 'design', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 5.60, 'Finished deliver the rebrand key visuals this week.'),
      ('adaeze@nexus.demo|7|0', 'adaeze@nexus.demo', 7, 'Finish the design token documentation', 'design', 'normal', 'delivered', false, 'none', null, true, null, 3.00, 2.80, 'Finished finish the design token documentation this week.'),
      ('adaeze@nexus.demo|7|1', 'adaeze@nexus.demo', 7, 'Produce campaign assets for the launch', 'design', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 4.30, 'Finished produce campaign assets for the launch this week.'),
      ('adaeze@nexus.demo|7|2', 'adaeze@nexus.demo', 7, 'Name and position the new service line', 'copy', 'critical', 'partial', false, 'none', null, true, null, 8.00, 9.00, 'Planning to name and position the new service line.'),
      ('adaeze@nexus.demo|7|3', 'adaeze@nexus.demo', 7, 'Refresh the pitch deck template', 'design', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 7.00, 'Finished refresh the pitch deck template this week.'),
      ('kelechi@nexus.demo|0|0', 'kelechi@nexus.demo', 0, 'Rewrite onboarding email sequence', 'copy', 'normal', 'in_progress', false, 'none', null, true, null, 6.00, null, 'Planning to rewrite onboarding email sequence.'),
      ('kelechi@nexus.demo|0|1', 'kelechi@nexus.demo', 0, 'Produce campaign assets for the launch', 'design', 'normal', 'dropped', true, 'none', null, true, null, 6.00, null, 'Planning to produce campaign assets for the launch.'),
      ('kelechi@nexus.demo|0|2', 'kelechi@nexus.demo', 0, 'Deliver the rebrand key visuals', 'design', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 11.20, 'Finished deliver the rebrand key visuals this week.'),
      ('kelechi@nexus.demo|0|3', 'kelechi@nexus.demo', 0, 'Write the landing page copy', 'copy', 'normal', 'partial', false, 'none', null, true, null, 9.00, 9.90, 'Planning to write the landing page copy.'),
      ('kelechi@nexus.demo|1|0', 'kelechi@nexus.demo', 1, 'Name and position the new service line', 'copy', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 9.70, 'Finished name and position the new service line this week.'),
      ('kelechi@nexus.demo|1|1', 'kelechi@nexus.demo', 1, 'Deliver the rebrand key visuals', 'design', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 10.50, 'Finished deliver the rebrand key visuals this week.'),
      ('kelechi@nexus.demo|1|2', 'kelechi@nexus.demo', 1, 'Emergency asset resize for the client pitch', 'copy', 'normal', 'delivered', false, 'none', null, false, null, 12.00, 13.10, 'Finished emergency asset resize for the client pitch this week.'),
      ('kelechi@nexus.demo|2|0', 'kelechi@nexus.demo', 2, 'Deliver the rebrand key visuals', 'design', 'critical', 'partial', true, 'none', null, true, null, 10.00, 8.90, 'Planning to deliver the rebrand key visuals.'),
      ('kelechi@nexus.demo|2|1', 'kelechi@nexus.demo', 2, 'Refresh the pitch deck template', 'design', 'normal', 'delivered', false, 'none', null, true, null, 3.00, 3.40, 'Finished refresh the pitch deck template this week.'),
      ('kelechi@nexus.demo|2|2', 'kelechi@nexus.demo', 2, 'Emergency asset resize for the client pitch', 'copy', 'high', 'delivered', false, 'none', null, false, null, 13.00, 11.10, 'Finished emergency asset resize for the client pitch this week.'),
      ('kelechi@nexus.demo|2|3', 'kelechi@nexus.demo', 2, 'Unplanned rework after the brand feedback session', 'copy', 'normal', 'delivered', false, 'none', null, false, null, 11.00, 11.00, 'Finished unplanned rework after the brand feedback session this week.'),
      ('kelechi@nexus.demo|2|4', 'kelechi@nexus.demo', 2, 'Name and position the new service line', 'copy', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 7.20, 'Finished name and position the new service line this week.'),
      ('kelechi@nexus.demo|3|0', 'kelechi@nexus.demo', 3, 'Rewrite onboarding email sequence', 'copy', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 7.80, 'Finished rewrite onboarding email sequence this week.'),
      ('kelechi@nexus.demo|3|1', 'kelechi@nexus.demo', 3, 'Emergency asset resize for the client pitch', 'design', 'normal', 'delivered', false, 'none', null, false, null, 13.00, 12.70, 'Finished emergency asset resize for the client pitch this week.'),
      ('kelechi@nexus.demo|3|2', 'kelechi@nexus.demo', 3, 'Unplanned rework after the brand feedback session', 'copy', 'normal', 'delivered', false, 'none', null, false, null, 4.00, 3.70, 'Finished unplanned rework after the brand feedback session this week.'),
      ('kelechi@nexus.demo|4|0', 'kelechi@nexus.demo', 4, 'Emergency asset resize for the client pitch', 'design', 'normal', 'delivered', false, 'none', null, false, null, 13.00, 13.10, 'Finished emergency asset resize for the client pitch this week.'),
      ('kelechi@nexus.demo|4|1', 'kelechi@nexus.demo', 4, 'Unplanned rework after the brand feedback session', 'copy', 'critical', 'delivered', false, 'none', null, false, null, 12.00, 12.00, 'Finished unplanned rework after the brand feedback session this week.'),
      ('kelechi@nexus.demo|4|2', 'kelechi@nexus.demo', 4, 'Deliver the rebrand key visuals', 'design', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 7.50, 'Finished deliver the rebrand key visuals this week.'),
      ('kelechi@nexus.demo|4|3', 'kelechi@nexus.demo', 4, 'Name and position the new service line', 'copy', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.50, 'Finished name and position the new service line this week.'),
      ('kelechi@nexus.demo|5|0', 'kelechi@nexus.demo', 5, 'Name and position the new service line', 'copy', 'normal', 'delivered', false, 'none', null, true, null, 3.00, 2.70, 'Finished name and position the new service line this week.'),
      ('kelechi@nexus.demo|5|1', 'kelechi@nexus.demo', 5, 'Emergency asset resize for the client pitch', 'design', 'normal', 'delivered', false, 'none', null, false, null, 6.00, 5.50, 'Finished emergency asset resize for the client pitch this week.'),
      ('kelechi@nexus.demo|5|2', 'kelechi@nexus.demo', 5, 'Refresh the pitch deck template', 'design', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 8.60, 'Finished refresh the pitch deck template this week.'),
      ('kelechi@nexus.demo|5|3', 'kelechi@nexus.demo', 5, 'Unplanned rework after the brand feedback session', 'copy', 'normal', 'delivered', false, 'none', null, false, null, 10.00, 11.50, 'Finished unplanned rework after the brand feedback session this week.'),
      ('kelechi@nexus.demo|6|0', 'kelechi@nexus.demo', 6, 'Emergency asset resize for the client pitch', 'design', 'normal', 'delivered', false, 'none', null, false, null, 9.00, 7.70, 'Finished emergency asset resize for the client pitch this week.'),
      ('kelechi@nexus.demo|6|1', 'kelechi@nexus.demo', 6, 'Unplanned rework after the brand feedback session', 'design', 'normal', 'delivered', false, 'none', null, false, null, 13.00, 12.10, 'Finished unplanned rework after the brand feedback session this week.'),
      ('kelechi@nexus.demo|6|2', 'kelechi@nexus.demo', 6, 'Name and position the new service line', 'copy', 'high', 'in_progress', false, 'none', null, true, null, 6.00, null, 'Planning to name and position the new service line.'),
      ('kelechi@nexus.demo|6|3', 'kelechi@nexus.demo', 6, 'Write the landing page copy', 'copy', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 11.10, 'Finished write the landing page copy this week.'),
      ('kelechi@nexus.demo|7|0', 'kelechi@nexus.demo', 7, 'Finish the design token documentation', 'design', 'normal', 'partial', false, 'none', null, true, null, 5.00, 4.70, 'Planning to finish the design token documentation.'),
      ('kelechi@nexus.demo|7|1', 'kelechi@nexus.demo', 7, 'Emergency asset resize for the client pitch', 'design', 'normal', 'delivered', false, 'none', null, false, null, 4.00, 3.80, 'Finished emergency asset resize for the client pitch this week.'),
      ('kelechi@nexus.demo|7|2', 'kelechi@nexus.demo', 7, 'Refresh the pitch deck template', 'design', 'normal', 'partial', true, 'none', null, true, null, 14.00, 14.90, 'Planning to refresh the pitch deck template.'),
      ('kelechi@nexus.demo|7|3', 'kelechi@nexus.demo', 7, 'Unplanned rework after the brand feedback session', 'design', 'normal', 'delivered', false, 'none', null, false, null, 7.00, 7.40, 'Finished unplanned rework after the brand feedback session this week.'),
      ('kelechi@nexus.demo|7|4', 'kelechi@nexus.demo', 7, 'Write the landing page copy', 'copy', 'normal', 'partial', true, 'none', null, true, null, 5.00, 4.30, 'Planning to write the landing page copy.'),
      ('halima@nexus.demo|0|0', 'halima@nexus.demo', 0, 'Finish the design token documentation', 'design', 'normal', 'delivered', false, 'none', null, true, null, 3.00, 2.60, 'Finished finish the design token documentation this week.'),
      ('halima@nexus.demo|0|1', 'halima@nexus.demo', 0, 'Write the landing page copy', 'copy', 'normal', 'dropped', false, 'none', null, true, null, 7.00, null, 'Planning to write the landing page copy.'),
      ('halima@nexus.demo|0|2', 'halima@nexus.demo', 0, 'Name and position the new service line', 'copy', 'critical', 'delivered', false, 'none', null, true, null, 14.00, 15.40, 'Finished name and position the new service line this week.'),
      ('halima@nexus.demo|0|3', 'halima@nexus.demo', 0, 'Rewrite onboarding email sequence', 'copy', 'normal', 'deferred', true, 'none', null, true, null, 9.00, null, 'Planning to rewrite onboarding email sequence.'),
      ('halima@nexus.demo|1|0', 'halima@nexus.demo', 1, 'Name and position the new service line', 'copy', 'high', 'delivered', false, 'none', null, true, null, 8.00, 8.70, 'Finished name and position the new service line this week.'),
      ('halima@nexus.demo|1|1', 'halima@nexus.demo', 1, 'Produce campaign assets for the launch', 'design', 'normal', 'deferred', true, 'none', null, true, null, 9.00, null, 'Planning to produce campaign assets for the launch.'),
      ('halima@nexus.demo|1|2', 'halima@nexus.demo', 1, 'Write the landing page copy', 'copy', 'high', 'partial', true, 'none', null, true, null, 10.00, 11.00, 'Planning to write the landing page copy.'),
      ('halima@nexus.demo|1|3', 'halima@nexus.demo', 1, 'Refresh the pitch deck template', 'design', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 5.70, 'Finished refresh the pitch deck template this week.'),
      ('halima@nexus.demo|2|0', 'halima@nexus.demo', 2, 'Name and position the new service line', 'copy', 'normal', 'partial', false, 'none', null, true, null, 8.00, 8.10, 'Planning to name and position the new service line.'),
      ('halima@nexus.demo|2|1', 'halima@nexus.demo', 2, 'Refresh the pitch deck template', 'design', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 5.60, 'Finished refresh the pitch deck template this week.'),
      ('halima@nexus.demo|2|2', 'halima@nexus.demo', 2, 'Finish the design token documentation', 'design', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 7.60, 'Finished finish the design token documentation this week.'),
      ('halima@nexus.demo|2|3', 'halima@nexus.demo', 2, 'Deliver the rebrand key visuals', 'design', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 9.00, 'Finished deliver the rebrand key visuals this week.'),
      ('halima@nexus.demo|3|0', 'halima@nexus.demo', 3, 'Refresh the pitch deck template', 'design', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 10.10, 'Finished refresh the pitch deck template this week.'),
      ('halima@nexus.demo|3|1', 'halima@nexus.demo', 3, 'Rewrite onboarding email sequence', 'copy', 'high', 'delivered', false, 'none', null, true, null, 14.00, 13.60, 'Finished rewrite onboarding email sequence this week.'),
      ('halima@nexus.demo|3|2', 'halima@nexus.demo', 3, 'Finish the design token documentation', 'design', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 12.60, 'Finished finish the design token documentation this week.'),
      ('halima@nexus.demo|4|0', 'halima@nexus.demo', 4, 'Deliver the rebrand key visuals', 'design', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 6.30, 'Finished deliver the rebrand key visuals this week.'),
      ('halima@nexus.demo|4|1', 'halima@nexus.demo', 4, 'Produce campaign assets for the launch', 'design', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 5.70, 'Finished produce campaign assets for the launch this week.'),
      ('halima@nexus.demo|4|2', 'halima@nexus.demo', 4, 'Rewrite onboarding email sequence', 'copy', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 4.50, 'Finished rewrite onboarding email sequence this week.'),
      ('halima@nexus.demo|4|3', 'halima@nexus.demo', 4, 'Write the landing page copy', 'copy', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 9.10, 'Finished write the landing page copy this week.'),
      ('halima@nexus.demo|5|0', 'halima@nexus.demo', 5, 'Finish the design token documentation', 'design', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 6.80, 'Finished finish the design token documentation this week.'),
      ('halima@nexus.demo|5|1', 'halima@nexus.demo', 5, 'Refresh the pitch deck template', 'design', 'normal', 'deferred', true, 'none', null, true, null, 5.00, null, 'Planning to refresh the pitch deck template.'),
      ('halima@nexus.demo|5|2', 'halima@nexus.demo', 5, 'Name and position the new service line', 'copy', 'high', 'delivered', false, 'none', null, true, null, 12.00, 12.40, 'Finished name and position the new service line this week.'),
      ('halima@nexus.demo|5|3', 'halima@nexus.demo', 5, 'Produce campaign assets for the launch', 'design', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 5.50, 'Finished produce campaign assets for the launch this week.'),
      ('halima@nexus.demo|5|4', 'halima@nexus.demo', 5, 'Rewrite onboarding email sequence', 'copy', 'critical', 'delivered', false, 'none', null, true, null, 7.00, 6.80, 'Finished rewrite onboarding email sequence this week.'),
      ('halima@nexus.demo|6|0', 'halima@nexus.demo', 6, 'Finish the design token documentation', 'design', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 10.00, 'Finished finish the design token documentation this week.'),
      ('halima@nexus.demo|6|1', 'halima@nexus.demo', 6, 'Refresh the pitch deck template', 'design', 'high', 'deferred', true, 'none', null, true, null, 12.00, null, 'Planning to refresh the pitch deck template.'),
      ('halima@nexus.demo|6|2', 'halima@nexus.demo', 6, 'Write the landing page copy', 'copy', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 8.60, 'Finished write the landing page copy this week.'),
      ('halima@nexus.demo|6|3', 'halima@nexus.demo', 6, 'Produce campaign assets for the launch', 'design', 'normal', 'in_progress', false, 'none', null, true, null, 13.00, null, 'Planning to produce campaign assets for the launch.'),
      ('halima@nexus.demo|7|0', 'halima@nexus.demo', 7, 'Rewrite onboarding email sequence', 'copy', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 7.70, 'Finished rewrite onboarding email sequence this week.'),
      ('halima@nexus.demo|7|1', 'halima@nexus.demo', 7, 'Deliver the rebrand key visuals', 'design', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 4.50, 'Finished deliver the rebrand key visuals this week.'),
      ('halima@nexus.demo|7|2', 'halima@nexus.demo', 7, 'Refresh the pitch deck template', 'design', 'normal', 'deferred', false, 'none', null, true, null, 12.00, null, 'Planning to refresh the pitch deck template.'),
      ('halima@nexus.demo|7|3', 'halima@nexus.demo', 7, 'Name and position the new service line', 'copy', 'normal', 'dropped', false, 'none', null, true, null, 3.00, null, 'Planning to name and position the new service line.'),
      ('segun@nexus.demo|0|0', 'segun@nexus.demo', 0, 'Onboard two new client accounts', 'delivery', 'critical', 'delivered', false, 'none', null, true, null, 14.00, 15.80, 'Finished onboard two new client accounts this week.'),
      ('segun@nexus.demo|0|1', 'segun@nexus.demo', 0, 'Run the quarterly access review', 'process', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 7.90, 'Finished run the quarterly access review this week.'),
      ('segun@nexus.demo|0|2', 'segun@nexus.demo', 0, 'Document the escalation path for late deliverables', 'process', 'normal', 'partial', true, 'none', null, true, null, 11.00, 10.10, 'Planning to document the escalation path for late deliverables.'),
      ('segun@nexus.demo|0|3', 'segun@nexus.demo', 0, 'Close out the Q3 vendor reconciliation', 'delivery', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 10.50, 'Finished close out the q3 vendor reconciliation this week.'),
      ('segun@nexus.demo|1|0', 'segun@nexus.demo', 1, 'Run the quarterly access review', 'process', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 4.50, 'Finished run the quarterly access review this week.'),
      ('segun@nexus.demo|1|1', 'segun@nexus.demo', 1, 'Document the escalation path for late deliverables', 'process', 'high', 'delivered', false, 'none', null, true, null, 3.00, 3.40, 'Finished document the escalation path for late deliverables this week.'),
      ('segun@nexus.demo|1|2', 'segun@nexus.demo', 1, 'Onboard two new client accounts', 'delivery', 'normal', 'deferred', true, 'none', null, true, null, 9.00, null, 'Planning to onboard two new client accounts.'),
      ('segun@nexus.demo|2|0', 'segun@nexus.demo', 2, 'Close out the Q3 vendor reconciliation', 'delivery', 'normal', 'partial', true, 'none', null, true, null, 12.00, 11.40, 'Planning to close out the q3 vendor reconciliation.'),
      ('segun@nexus.demo|2|1', 'segun@nexus.demo', 2, 'Rewrite the delivery handover checklist', 'delivery', 'normal', 'in_progress', false, 'none', null, true, null, 6.00, null, 'Planning to rewrite the delivery handover checklist.'),
      ('segun@nexus.demo|2|2', 'segun@nexus.demo', 2, 'Onboard two new client accounts', 'delivery', 'normal', 'partial', true, 'none', null, true, null, 9.00, 8.70, 'Planning to onboard two new client accounts.'),
      ('segun@nexus.demo|2|3', 'segun@nexus.demo', 2, 'Run the quarterly access review', 'process', 'normal', 'delivered', false, 'none', null, true, null, 14.00, 15.30, 'Finished run the quarterly access review this week.'),
      ('segun@nexus.demo|2|4', 'segun@nexus.demo', 2, 'Document the escalation path for late deliverables', 'process', 'normal', 'partial', false, 'none', null, true, null, 8.00, 8.70, 'Planning to document the escalation path for late deliverables.'),
      ('segun@nexus.demo|3|0', 'segun@nexus.demo', 3, 'Document the escalation path for late deliverables', 'process', 'normal', 'dropped', true, 'none', null, true, null, 8.00, null, 'Planning to document the escalation path for late deliverables.'),
      ('segun@nexus.demo|3|1', 'segun@nexus.demo', 3, 'Close out the Q3 vendor reconciliation', 'delivery', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 8.20, 'Finished close out the q3 vendor reconciliation this week.'),
      ('segun@nexus.demo|3|2', 'segun@nexus.demo', 3, 'Run the quarterly access review', 'process', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 11.90, 'Finished run the quarterly access review this week.'),
      ('segun@nexus.demo|3|3', 'segun@nexus.demo', 3, 'Onboard two new client accounts', 'delivery', 'high', 'delivered', false, 'none', null, true, null, 12.00, 13.30, 'Finished onboard two new client accounts this week.'),
      ('segun@nexus.demo|4|0', 'segun@nexus.demo', 4, 'Run the quarterly access review', 'process', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 10.30, 'Finished run the quarterly access review this week.'),
      ('segun@nexus.demo|4|1', 'segun@nexus.demo', 4, 'Onboard two new client accounts', 'delivery', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 9.20, 'Finished onboard two new client accounts this week.'),
      ('segun@nexus.demo|4|2', 'segun@nexus.demo', 4, 'Close out the Q3 vendor reconciliation', 'delivery', 'normal', 'partial', true, 'none', null, true, null, 10.00, 9.40, 'Planning to close out the q3 vendor reconciliation.'),
      ('segun@nexus.demo|4|3', 'segun@nexus.demo', 4, 'Document the escalation path for late deliverables', 'process', 'normal', 'deferred', true, 'none', null, true, null, 7.00, null, 'Planning to document the escalation path for late deliverables.'),
      ('segun@nexus.demo|5|0', 'segun@nexus.demo', 5, 'Onboard two new client accounts', 'delivery', 'normal', 'partial', false, 'none', null, true, null, 5.00, 5.60, 'Planning to onboard two new client accounts.'),
      ('segun@nexus.demo|5|1', 'segun@nexus.demo', 5, 'Run the quarterly access review', 'process', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 10.70, 'Finished run the quarterly access review this week.'),
      ('segun@nexus.demo|5|2', 'segun@nexus.demo', 5, 'Document the escalation path for late deliverables', 'process', 'normal', 'in_progress', false, 'none', null, true, null, 10.00, null, 'Planning to document the escalation path for late deliverables.'),
      ('segun@nexus.demo|6|0', 'segun@nexus.demo', 6, 'Rewrite the delivery handover checklist', 'delivery', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 10.20, 'Finished rewrite the delivery handover checklist this week.'),
      ('segun@nexus.demo|6|1', 'segun@nexus.demo', 6, 'Run the quarterly access review', 'process', 'normal', 'delivered', false, 'none', null, true, null, 14.00, 14.70, 'Finished run the quarterly access review this week.'),
      ('segun@nexus.demo|6|2', 'segun@nexus.demo', 6, 'Onboard two new client accounts', 'delivery', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.00, 'Finished onboard two new client accounts this week.'),
      ('segun@nexus.demo|7|0', 'segun@nexus.demo', 7, 'Close out the Q3 vendor reconciliation', 'delivery', 'critical', 'delivered', false, 'none', null, true, null, 5.00, 5.00, 'Finished close out the q3 vendor reconciliation this week.'),
      ('segun@nexus.demo|7|1', 'segun@nexus.demo', 7, 'Rewrite the delivery handover checklist', 'delivery', 'normal', 'deferred', false, 'none', null, true, null, 13.00, null, 'Planning to rewrite the delivery handover checklist.'),
      ('segun@nexus.demo|7|2', 'segun@nexus.demo', 7, 'Document the escalation path for late deliverables', 'process', 'normal', 'deferred', false, 'none', null, true, null, 9.00, null, 'Planning to document the escalation path for late deliverables.'),
      ('segun@nexus.demo|7|3', 'segun@nexus.demo', 7, 'Run the quarterly access review', 'process', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 11.20, 'Finished run the quarterly access review this week.'),
      ('blessing@nexus.demo|0|0', 'blessing@nexus.demo', 0, 'Document the escalation path for late deliverables', 'process', 'normal', 'partial', true, 'none', null, true, null, 8.00, 7.10, 'Planning to document the escalation path for late deliverables.'),
      ('blessing@nexus.demo|0|1', 'blessing@nexus.demo', 0, 'Onboard two new client accounts', 'delivery', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 10.40, 'Finished onboard two new client accounts this week.'),
      ('blessing@nexus.demo|0|2', 'blessing@nexus.demo', 0, 'Rewrite the delivery handover checklist', 'delivery', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 8.10, 'Finished rewrite the delivery handover checklist this week.'),
      ('blessing@nexus.demo|0|3', 'blessing@nexus.demo', 0, 'Close out the Q3 vendor reconciliation', 'delivery', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 12.30, 'Finished close out the q3 vendor reconciliation this week.'),
      ('blessing@nexus.demo|1|0', 'blessing@nexus.demo', 1, 'Document the escalation path for late deliverables', 'process', 'high', 'partial', false, 'none', null, true, null, 9.00, 9.50, 'Planning to document the escalation path for late deliverables.'),
      ('blessing@nexus.demo|1|1', 'blessing@nexus.demo', 1, 'Rewrite the delivery handover checklist', 'delivery', 'normal', 'delivered', false, 'none', null, true, null, 14.00, 16.00, 'Finished rewrite the delivery handover checklist this week.'),
      ('blessing@nexus.demo|1|2', 'blessing@nexus.demo', 1, 'Close out the Q3 vendor reconciliation', 'delivery', 'high', 'delivered', false, 'none', null, true, null, 12.00, 10.30, 'Finished close out the q3 vendor reconciliation this week.'),
      ('blessing@nexus.demo|1|3', 'blessing@nexus.demo', 1, 'Onboard two new client accounts', 'delivery', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 5.30, 'Finished onboard two new client accounts this week.'),
      ('blessing@nexus.demo|2|0', 'blessing@nexus.demo', 2, 'Document the escalation path for late deliverables', 'process', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 14.30, 'Finished document the escalation path for late deliverables this week.'),
      ('blessing@nexus.demo|2|1', 'blessing@nexus.demo', 2, 'Onboard two new client accounts', 'delivery', 'normal', 'in_progress', false, 'none', null, true, null, 6.00, null, 'Planning to onboard two new client accounts.'),
      ('blessing@nexus.demo|2|2', 'blessing@nexus.demo', 2, 'Close out the Q3 vendor reconciliation', 'delivery', 'normal', 'deferred', false, 'none', null, true, null, 12.00, null, 'Planning to close out the q3 vendor reconciliation.'),
      ('blessing@nexus.demo|2|3', 'blessing@nexus.demo', 2, 'Rewrite the delivery handover checklist', 'delivery', 'normal', 'dropped', false, 'none', null, true, null, 8.00, null, 'Planning to rewrite the delivery handover checklist.'),
      ('blessing@nexus.demo|2|4', 'blessing@nexus.demo', 2, 'Run the quarterly access review', 'process', 'normal', 'deferred', false, 'none', null, true, null, 9.00, null, 'Planning to run the quarterly access review.'),
      ('blessing@nexus.demo|3|0', 'blessing@nexus.demo', 3, 'Close out the Q3 vendor reconciliation', 'delivery', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 8.60, 'Finished close out the q3 vendor reconciliation this week.'),
      ('blessing@nexus.demo|3|1', 'blessing@nexus.demo', 3, 'Onboard two new client accounts', 'delivery', 'critical', 'delivered', false, 'none', null, true, null, 13.00, 14.30, 'Finished onboard two new client accounts this week.'),
      ('blessing@nexus.demo|3|2', 'blessing@nexus.demo', 3, 'Rewrite the delivery handover checklist', 'delivery', 'critical', 'delivered', false, 'none', null, true, null, 5.00, 4.80, 'Finished rewrite the delivery handover checklist this week.'),
      ('blessing@nexus.demo|3|3', 'blessing@nexus.demo', 3, 'Document the escalation path for late deliverables', 'process', 'high', 'partial', false, 'none', null, true, null, 4.00, 4.50, 'Planning to document the escalation path for late deliverables.'),
      ('blessing@nexus.demo|4|0', 'blessing@nexus.demo', 4, 'Rewrite the delivery handover checklist', 'delivery', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 11.80, 'Finished rewrite the delivery handover checklist this week.'),
      ('blessing@nexus.demo|4|1', 'blessing@nexus.demo', 4, 'Onboard two new client accounts', 'delivery', 'high', 'dropped', true, 'none', null, true, null, 4.00, null, 'Planning to onboard two new client accounts.'),
      ('blessing@nexus.demo|4|2', 'blessing@nexus.demo', 4, 'Run the quarterly access review', 'process', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 10.60, 'Finished run the quarterly access review this week.'),
      ('blessing@nexus.demo|4|3', 'blessing@nexus.demo', 4, 'Close out the Q3 vendor reconciliation', 'delivery', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 14.30, 'Finished close out the q3 vendor reconciliation this week.'),
      ('blessing@nexus.demo|4|4', 'blessing@nexus.demo', 4, 'Document the escalation path for late deliverables', 'process', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 6.10, 'Finished document the escalation path for late deliverables this week.'),
      ('blessing@nexus.demo|5|0', 'blessing@nexus.demo', 5, 'Rewrite the delivery handover checklist', 'delivery', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 13.40, 'Finished rewrite the delivery handover checklist this week.'),
      ('blessing@nexus.demo|5|1', 'blessing@nexus.demo', 5, 'Document the escalation path for late deliverables', 'process', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 3.50, 'Finished document the escalation path for late deliverables this week.'),
      ('blessing@nexus.demo|5|2', 'blessing@nexus.demo', 5, 'Onboard two new client accounts', 'delivery', 'normal', 'dropped', true, 'none', null, true, null, 13.00, null, 'Planning to onboard two new client accounts.'),
      ('blessing@nexus.demo|5|3', 'blessing@nexus.demo', 5, 'Close out the Q3 vendor reconciliation', 'delivery', 'high', 'partial', true, 'none', null, true, null, 10.00, 11.20, 'Planning to close out the q3 vendor reconciliation.'),
      ('blessing@nexus.demo|6|0', 'blessing@nexus.demo', 6, 'Rewrite the delivery handover checklist', 'delivery', 'normal', 'deferred', true, 'none', null, true, null, 5.00, null, 'Planning to rewrite the delivery handover checklist.'),
      ('blessing@nexus.demo|6|1', 'blessing@nexus.demo', 6, 'Document the escalation path for late deliverables', 'process', 'high', 'in_progress', true, 'none', null, true, null, 10.00, null, 'Planning to document the escalation path for late deliverables.'),
      ('blessing@nexus.demo|6|2', 'blessing@nexus.demo', 6, 'Onboard two new client accounts', 'delivery', 'normal', 'deferred', false, 'none', null, true, null, 6.00, null, 'Planning to onboard two new client accounts.'),
      ('blessing@nexus.demo|6|3', 'blessing@nexus.demo', 6, 'Run the quarterly access review', 'process', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 5.90, 'Finished run the quarterly access review this week.'),
      ('blessing@nexus.demo|7|0', 'blessing@nexus.demo', 7, 'Document the escalation path for late deliverables', 'process', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 10.60, 'Finished document the escalation path for late deliverables this week.'),
      ('blessing@nexus.demo|7|1', 'blessing@nexus.demo', 7, 'Onboard two new client accounts', 'delivery', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 7.80, 'Finished onboard two new client accounts this week.'),
      ('blessing@nexus.demo|7|2', 'blessing@nexus.demo', 7, 'Rewrite the delivery handover checklist', 'delivery', 'critical', 'delivered', false, 'none', null, true, null, 11.00, 11.50, 'Finished rewrite the delivery handover checklist this week.'),
      ('ifeoma@nexus.demo|0|0', 'ifeoma@nexus.demo', 0, 'Sign the distribution partnership', 'partnerships', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 3.90, 'Finished sign the distribution partnership this week.'),
      ('ifeoma@nexus.demo|0|1', 'ifeoma@nexus.demo', 0, 'Qualify the inbound partnership pipeline', 'pipeline', 'high', 'partial', false, 'none', null, true, null, 4.00, 3.90, 'Planning to qualify the inbound partnership pipeline.'),
      ('ifeoma@nexus.demo|0|2', 'ifeoma@nexus.demo', 0, 'Close the two outstanding renewal conversations', 'pipeline', 'normal', 'deferred', true, 'none', null, true, null, 7.00, null, 'Planning to close the two outstanding renewal conversations.'),
      ('ifeoma@nexus.demo|0|3', 'ifeoma@nexus.demo', 0, 'Build the Q4 outbound sequence', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 3.80, 'Finished build the q4 outbound sequence this week.'),
      ('ifeoma@nexus.demo|1|0', 'ifeoma@nexus.demo', 1, 'Build the Q4 outbound sequence', 'pipeline', 'high', 'partial', true, 'none', null, true, null, 4.00, 4.20, 'Planning to build the q4 outbound sequence.'),
      ('ifeoma@nexus.demo|1|1', 'ifeoma@nexus.demo', 1, 'Run the partner enablement session', 'partnerships', 'normal', 'partial', true, 'none', null, true, null, 11.00, 12.30, 'Planning to run the partner enablement session.'),
      ('ifeoma@nexus.demo|1|2', 'ifeoma@nexus.demo', 1, 'Qualify the inbound partnership pipeline', 'pipeline', 'normal', 'deferred', true, 'none', null, true, null, 12.00, null, 'Planning to qualify the inbound partnership pipeline.'),
      ('ifeoma@nexus.demo|1|3', 'ifeoma@nexus.demo', 1, 'Sign the distribution partnership', 'partnerships', 'critical', 'delivered', false, 'none', null, true, null, 12.00, 13.60, 'Finished sign the distribution partnership this week.'),
      ('ifeoma@nexus.demo|2|0', 'ifeoma@nexus.demo', 2, 'Close the two outstanding renewal conversations', 'pipeline', 'high', 'delivered', false, 'none', null, true, null, 10.00, 9.40, 'Finished close the two outstanding renewal conversations this week.'),
      ('ifeoma@nexus.demo|2|1', 'ifeoma@nexus.demo', 2, 'Qualify the inbound partnership pipeline', 'pipeline', 'high', 'delivered', false, 'none', null, true, null, 7.00, 6.30, 'Finished qualify the inbound partnership pipeline this week.'),
      ('ifeoma@nexus.demo|2|2', 'ifeoma@nexus.demo', 2, 'Build the Q4 outbound sequence', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 4.30, 'Finished build the q4 outbound sequence this week.'),
      ('ifeoma@nexus.demo|2|3', 'ifeoma@nexus.demo', 2, 'Sign the distribution partnership', 'partnerships', 'critical', 'delivered', false, 'none', null, true, null, 5.00, 5.40, 'Finished sign the distribution partnership this week.'),
      ('ifeoma@nexus.demo|3|0', 'ifeoma@nexus.demo', 3, 'Close the two outstanding renewal conversations', 'pipeline', 'high', 'delivered', false, 'none', null, true, null, 5.00, 5.50, 'Finished close the two outstanding renewal conversations this week.'),
      ('ifeoma@nexus.demo|3|1', 'ifeoma@nexus.demo', 3, 'Run the partner enablement session', 'partnerships', 'high', 'partial', true, 'none', null, true, null, 4.00, 3.50, 'Planning to run the partner enablement session.'),
      ('ifeoma@nexus.demo|3|2', 'ifeoma@nexus.demo', 3, 'Build the Q4 outbound sequence', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 3.00, 3.30, 'Finished build the q4 outbound sequence this week.'),
      ('ifeoma@nexus.demo|3|3', 'ifeoma@nexus.demo', 3, 'Qualify the inbound partnership pipeline', 'pipeline', 'normal', 'partial', true, 'none', null, true, null, 8.00, 9.20, 'Planning to qualify the inbound partnership pipeline.'),
      ('ifeoma@nexus.demo|3|4', 'ifeoma@nexus.demo', 3, 'Sign the distribution partnership', 'partnerships', 'normal', 'deferred', true, 'none', null, true, null, 5.00, null, 'Planning to sign the distribution partnership.'),
      ('ifeoma@nexus.demo|4|0', 'ifeoma@nexus.demo', 4, 'Sign the distribution partnership', 'partnerships', 'critical', 'delivered', false, 'none', null, true, null, 12.00, 10.40, 'Finished sign the distribution partnership this week.'),
      ('ifeoma@nexus.demo|4|1', 'ifeoma@nexus.demo', 4, 'Build the Q4 outbound sequence', 'pipeline', 'normal', 'partial', true, 'none', null, true, null, 8.00, 6.80, 'Planning to build the q4 outbound sequence.'),
      ('ifeoma@nexus.demo|4|2', 'ifeoma@nexus.demo', 4, 'Qualify the inbound partnership pipeline', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 7.70, 'Finished qualify the inbound partnership pipeline this week.'),
      ('ifeoma@nexus.demo|4|3', 'ifeoma@nexus.demo', 4, 'Close the two outstanding renewal conversations', 'pipeline', 'normal', 'partial', true, 'none', null, true, null, 4.00, 4.60, 'Planning to close the two outstanding renewal conversations.'),
      ('ifeoma@nexus.demo|4|4', 'ifeoma@nexus.demo', 4, 'Run the partner enablement session', 'partnerships', 'normal', 'in_progress', false, 'none', null, true, null, 8.00, null, 'Planning to run the partner enablement session.'),
      ('ifeoma@nexus.demo|5|0', 'ifeoma@nexus.demo', 5, 'Sign the distribution partnership', 'partnerships', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 8.20, 'Finished sign the distribution partnership this week.'),
      ('ifeoma@nexus.demo|5|1', 'ifeoma@nexus.demo', 5, 'Qualify the inbound partnership pipeline', 'pipeline', 'normal', 'in_progress', false, 'none', null, true, null, 12.00, null, 'Planning to qualify the inbound partnership pipeline.'),
      ('ifeoma@nexus.demo|5|2', 'ifeoma@nexus.demo', 5, 'Run the partner enablement session', 'partnerships', 'normal', 'deferred', false, 'none', null, true, null, 6.00, null, 'Planning to run the partner enablement session.'),
      ('ifeoma@nexus.demo|6|0', 'ifeoma@nexus.demo', 6, 'Qualify the inbound partnership pipeline', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 13.70, 'Finished qualify the inbound partnership pipeline this week.'),
      ('ifeoma@nexus.demo|6|1', 'ifeoma@nexus.demo', 6, 'Close the two outstanding renewal conversations', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 13.10, 'Finished close the two outstanding renewal conversations this week.'),
      ('ifeoma@nexus.demo|6|2', 'ifeoma@nexus.demo', 6, 'Build the Q4 outbound sequence', 'pipeline', 'normal', 'partial', true, 'none', null, true, null, 12.00, 10.60, 'Planning to build the q4 outbound sequence.'),
      ('ifeoma@nexus.demo|6|3', 'ifeoma@nexus.demo', 6, 'Sign the distribution partnership', 'partnerships', 'normal', 'in_progress', true, 'none', null, true, null, 10.00, null, 'Planning to sign the distribution partnership.'),
      ('ifeoma@nexus.demo|6|4', 'ifeoma@nexus.demo', 6, 'Run the partner enablement session', 'partnerships', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.40, 'Finished run the partner enablement session this week.'),
      ('ifeoma@nexus.demo|7|0', 'ifeoma@nexus.demo', 7, 'Run the partner enablement session', 'partnerships', 'critical', 'deferred', true, 'none', null, true, null, 10.00, null, 'Planning to run the partner enablement session.'),
      ('ifeoma@nexus.demo|7|1', 'ifeoma@nexus.demo', 7, 'Qualify the inbound partnership pipeline', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 14.00, 15.90, 'Finished qualify the inbound partnership pipeline this week.'),
      ('ifeoma@nexus.demo|7|2', 'ifeoma@nexus.demo', 7, 'Sign the distribution partnership', 'partnerships', 'normal', 'dropped', false, 'none', null, true, null, 11.00, null, 'Planning to sign the distribution partnership.'),
      ('ifeoma@nexus.demo|7|3', 'ifeoma@nexus.demo', 7, 'Build the Q4 outbound sequence', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 3.00, 3.00, 'Finished build the q4 outbound sequence this week.'),
      ('musa@nexus.demo|0|0', 'musa@nexus.demo', 0, 'Qualify the inbound partnership pipeline', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 8.90, 'Finished qualify the inbound partnership pipeline this week.'),
      ('musa@nexus.demo|0|1', 'musa@nexus.demo', 0, 'Sign the distribution partnership', 'partnerships', 'normal', 'partial', true, 'none', null, true, null, 5.00, 5.70, 'Planning to sign the distribution partnership.'),
      ('musa@nexus.demo|0|2', 'musa@nexus.demo', 0, 'Close the two outstanding renewal conversations', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 14.00, 14.50, 'Finished close the two outstanding renewal conversations this week.'),
      ('musa@nexus.demo|0|3', 'musa@nexus.demo', 0, 'Run the partner enablement session', 'partnerships', 'normal', 'partial', false, 'none', null, true, null, 5.00, 4.40, 'Planning to run the partner enablement session.'),
      ('musa@nexus.demo|1|0', 'musa@nexus.demo', 1, 'Sign the distribution partnership', 'partnerships', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 13.50, 'Finished sign the distribution partnership this week.'),
      ('musa@nexus.demo|1|1', 'musa@nexus.demo', 1, 'Run the partner enablement session', 'partnerships', 'high', 'delivered', false, 'none', null, true, null, 11.00, 11.50, 'Finished run the partner enablement session this week.'),
      ('musa@nexus.demo|1|2', 'musa@nexus.demo', 1, 'Close the two outstanding renewal conversations', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 11.10, 'Finished close the two outstanding renewal conversations this week.'),
      ('musa@nexus.demo|1|3', 'musa@nexus.demo', 1, 'Qualify the inbound partnership pipeline', 'pipeline', 'normal', 'deferred', true, 'none', null, true, null, 6.00, null, 'Planning to qualify the inbound partnership pipeline.'),
      ('musa@nexus.demo|1|4', 'musa@nexus.demo', 1, 'Build the Q4 outbound sequence', 'pipeline', 'normal', 'deferred', false, 'none', null, true, null, 5.00, null, 'Planning to build the q4 outbound sequence.'),
      ('musa@nexus.demo|2|0', 'musa@nexus.demo', 2, 'Qualify the inbound partnership pipeline', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.00, 'Finished qualify the inbound partnership pipeline this week.'),
      ('musa@nexus.demo|2|1', 'musa@nexus.demo', 2, 'Build the Q4 outbound sequence', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 13.50, 'Finished build the q4 outbound sequence this week.'),
      ('musa@nexus.demo|2|2', 'musa@nexus.demo', 2, 'Sign the distribution partnership', 'partnerships', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 10.80, 'Finished sign the distribution partnership this week.'),
      ('musa@nexus.demo|2|3', 'musa@nexus.demo', 2, 'Run the partner enablement session', 'partnerships', 'normal', 'partial', true, 'none', null, true, null, 12.00, 13.30, 'Planning to run the partner enablement session.'),
      ('musa@nexus.demo|2|4', 'musa@nexus.demo', 2, 'Close the two outstanding renewal conversations', 'pipeline', 'high', 'delivered', false, 'none', null, true, null, 7.00, 7.50, 'Finished close the two outstanding renewal conversations this week.'),
      ('musa@nexus.demo|3|0', 'musa@nexus.demo', 3, 'Run the partner enablement session', 'partnerships', 'normal', 'dropped', true, 'none', null, true, null, 6.00, null, 'Planning to run the partner enablement session.'),
      ('musa@nexus.demo|3|1', 'musa@nexus.demo', 3, 'Close the two outstanding renewal conversations', 'pipeline', 'high', 'delivered', false, 'none', null, true, null, 8.00, 7.30, 'Finished close the two outstanding renewal conversations this week.'),
      ('musa@nexus.demo|3|2', 'musa@nexus.demo', 3, 'Sign the distribution partnership', 'partnerships', 'normal', 'deferred', true, 'none', null, true, null, 10.00, null, 'Planning to sign the distribution partnership.'),
      ('musa@nexus.demo|4|0', 'musa@nexus.demo', 4, 'Qualify the inbound partnership pipeline', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 11.30, 'Finished qualify the inbound partnership pipeline this week.'),
      ('musa@nexus.demo|4|1', 'musa@nexus.demo', 4, 'Close the two outstanding renewal conversations', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 8.10, 'Finished close the two outstanding renewal conversations this week.'),
      ('musa@nexus.demo|4|2', 'musa@nexus.demo', 4, 'Build the Q4 outbound sequence', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 9.10, 'Finished build the q4 outbound sequence this week.'),
      ('musa@nexus.demo|4|3', 'musa@nexus.demo', 4, 'Run the partner enablement session', 'partnerships', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 6.10, 'Finished run the partner enablement session this week.'),
      ('musa@nexus.demo|5|0', 'musa@nexus.demo', 5, 'Build the Q4 outbound sequence', 'pipeline', 'normal', 'in_progress', false, 'none', null, true, null, 11.00, null, 'Planning to build the q4 outbound sequence.'),
      ('musa@nexus.demo|5|1', 'musa@nexus.demo', 5, 'Sign the distribution partnership', 'partnerships', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 10.90, 'Finished sign the distribution partnership this week.'),
      ('musa@nexus.demo|5|2', 'musa@nexus.demo', 5, 'Qualify the inbound partnership pipeline', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 14.00, 15.60, 'Finished qualify the inbound partnership pipeline this week.'),
      ('musa@nexus.demo|5|3', 'musa@nexus.demo', 5, 'Run the partner enablement session', 'partnerships', 'normal', 'dropped', false, 'none', null, true, null, 10.00, null, 'Planning to run the partner enablement session.'),
      ('musa@nexus.demo|6|0', 'musa@nexus.demo', 6, 'Build the Q4 outbound sequence', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 6.40, 'Finished build the q4 outbound sequence this week.'),
      ('musa@nexus.demo|6|1', 'musa@nexus.demo', 6, 'Close the two outstanding renewal conversations', 'pipeline', 'normal', 'partial', false, 'none', null, true, null, 12.00, 12.80, 'Planning to close the two outstanding renewal conversations.'),
      ('musa@nexus.demo|6|2', 'musa@nexus.demo', 6, 'Qualify the inbound partnership pipeline', 'pipeline', 'high', 'partial', true, 'none', null, true, null, 4.00, 4.50, 'Planning to qualify the inbound partnership pipeline.'),
      ('musa@nexus.demo|6|3', 'musa@nexus.demo', 6, 'Sign the distribution partnership', 'partnerships', 'high', 'dropped', false, 'none', null, true, null, 5.00, null, 'Planning to sign the distribution partnership.'),
      ('musa@nexus.demo|7|0', 'musa@nexus.demo', 7, 'Run the partner enablement session', 'partnerships', 'normal', 'dropped', true, 'none', null, true, null, 12.00, null, 'Planning to run the partner enablement session.'),
      ('musa@nexus.demo|7|1', 'musa@nexus.demo', 7, 'Qualify the inbound partnership pipeline', 'pipeline', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 12.10, 'Finished qualify the inbound partnership pipeline this week.'),
      ('musa@nexus.demo|7|2', 'musa@nexus.demo', 7, 'Build the Q4 outbound sequence', 'pipeline', 'high', 'delivered', false, 'none', null, true, null, 12.00, 12.60, 'Finished build the q4 outbound sequence this week.'),
      ('hr@nexus.demo|0|0', 'hr@nexus.demo', 0, 'Refresh the onboarding handbook', 'policy', 'high', 'deferred', false, 'none', null, true, null, 10.00, null, 'Planning to refresh the onboarding handbook.'),
      ('hr@nexus.demo|0|1', 'hr@nexus.demo', 0, 'Publish the updated role scorecards', 'hiring', 'normal', 'partial', false, 'none', null, true, null, 13.00, 14.10, 'Planning to publish the updated role scorecards.'),
      ('hr@nexus.demo|0|2', 'hr@nexus.demo', 0, 'Complete the quarterly right-to-work checks', 'policy', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 5.40, 'Finished complete the quarterly right-to-work checks this week.'),
      ('hr@nexus.demo|0|3', 'hr@nexus.demo', 0, 'Close out the two open engineering offers', 'hiring', 'normal', 'in_progress', false, 'none', null, true, null, 12.00, null, 'Planning to close out the two open engineering offers.'),
      ('hr@nexus.demo|0|4', 'hr@nexus.demo', 0, 'Finish the annual leave policy update', 'policy', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.20, 'Finished finish the annual leave policy update this week.'),
      ('hr@nexus.demo|1|0', 'hr@nexus.demo', 1, 'Refresh the onboarding handbook', 'policy', 'normal', 'delivered', false, 'none', null, true, null, 14.00, 12.10, 'Finished refresh the onboarding handbook this week.'),
      ('hr@nexus.demo|1|1', 'hr@nexus.demo', 1, 'Close out the two open engineering offers', 'hiring', 'normal', 'dropped', false, 'none', null, true, null, 6.00, null, 'Planning to close out the two open engineering offers.'),
      ('hr@nexus.demo|1|2', 'hr@nexus.demo', 1, 'Finish the annual leave policy update', 'policy', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 9.20, 'Finished finish the annual leave policy update this week.'),
      ('hr@nexus.demo|2|0', 'hr@nexus.demo', 2, 'Close out the two open engineering offers', 'hiring', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 8.60, 'Finished close out the two open engineering offers this week.'),
      ('hr@nexus.demo|2|1', 'hr@nexus.demo', 2, 'Run the interview panel calibration session', 'hiring', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 8.40, 'Finished run the interview panel calibration session this week.'),
      ('hr@nexus.demo|2|2', 'hr@nexus.demo', 2, 'Refresh the onboarding handbook', 'policy', 'normal', 'in_progress', true, 'none', null, true, null, 5.00, null, 'Planning to refresh the onboarding handbook.'),
      ('hr@nexus.demo|2|3', 'hr@nexus.demo', 2, 'Complete the quarterly right-to-work checks', 'policy', 'high', 'in_progress', false, 'none', null, true, null, 6.00, null, 'Planning to complete the quarterly right-to-work checks.'),
      ('hr@nexus.demo|3|0', 'hr@nexus.demo', 3, 'Publish the updated role scorecards', 'hiring', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 12.50, 'Finished publish the updated role scorecards this week.'),
      ('hr@nexus.demo|3|1', 'hr@nexus.demo', 3, 'Finish the annual leave policy update', 'policy', 'normal', 'partial', true, 'none', null, true, null, 4.00, 4.60, 'Planning to finish the annual leave policy update.'),
      ('hr@nexus.demo|3|2', 'hr@nexus.demo', 3, 'Run the interview panel calibration session', 'hiring', 'normal', 'deferred', true, 'none', null, true, null, 10.00, null, 'Planning to run the interview panel calibration session.'),
      ('hr@nexus.demo|3|3', 'hr@nexus.demo', 3, 'Complete the quarterly right-to-work checks', 'policy', 'normal', 'partial', true, 'none', null, true, null, 10.00, 8.70, 'Planning to complete the quarterly right-to-work checks.'),
      ('hr@nexus.demo|4|0', 'hr@nexus.demo', 4, 'Run the interview panel calibration session', 'hiring', 'normal', 'in_progress', true, 'none', null, true, null, 5.00, null, 'Planning to run the interview panel calibration session.'),
      ('hr@nexus.demo|4|1', 'hr@nexus.demo', 4, 'Finish the annual leave policy update', 'policy', 'normal', 'partial', true, 'none', null, true, null, 7.00, 6.30, 'Planning to finish the annual leave policy update.'),
      ('hr@nexus.demo|4|2', 'hr@nexus.demo', 4, 'Complete the quarterly right-to-work checks', 'policy', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 8.00, 'Finished complete the quarterly right-to-work checks this week.'),
      ('hr@nexus.demo|4|3', 'hr@nexus.demo', 4, 'Close out the two open engineering offers', 'hiring', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 4.30, 'Finished close out the two open engineering offers this week.'),
      ('hr@nexus.demo|5|0', 'hr@nexus.demo', 5, 'Publish the updated role scorecards', 'hiring', 'normal', 'deferred', true, 'none', null, true, null, 12.00, null, 'Planning to publish the updated role scorecards.'),
      ('hr@nexus.demo|5|1', 'hr@nexus.demo', 5, 'Run the interview panel calibration session', 'hiring', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 6.40, 'Finished run the interview panel calibration session this week.'),
      ('hr@nexus.demo|5|2', 'hr@nexus.demo', 5, 'Complete the quarterly right-to-work checks', 'policy', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 8.80, 'Finished complete the quarterly right-to-work checks this week.'),
      ('hr@nexus.demo|6|0', 'hr@nexus.demo', 6, 'Complete the quarterly right-to-work checks', 'policy', 'high', 'delivered', false, 'none', null, true, null, 13.00, 14.60, 'Finished complete the quarterly right-to-work checks this week.'),
      ('hr@nexus.demo|6|1', 'hr@nexus.demo', 6, 'Finish the annual leave policy update', 'policy', 'normal', 'partial', false, 'none', null, true, null, 6.00, 6.40, 'Planning to finish the annual leave policy update.'),
      ('hr@nexus.demo|6|2', 'hr@nexus.demo', 6, 'Refresh the onboarding handbook', 'policy', 'critical', 'delivered', false, 'none', null, true, null, 13.00, 14.20, 'Finished refresh the onboarding handbook this week.'),
      ('hr@nexus.demo|7|0', 'hr@nexus.demo', 7, 'Complete the quarterly right-to-work checks', 'policy', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.20, 'Finished complete the quarterly right-to-work checks this week.'),
      ('hr@nexus.demo|7|1', 'hr@nexus.demo', 7, 'Publish the updated role scorecards', 'hiring', 'normal', 'in_progress', true, 'none', null, true, null, 5.00, null, 'Planning to publish the updated role scorecards.'),
      ('hr@nexus.demo|7|2', 'hr@nexus.demo', 7, 'Run the interview panel calibration session', 'hiring', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 5.60, 'Finished run the interview panel calibration session this week.'),
      ('hr@nexus.demo|7|3', 'hr@nexus.demo', 7, 'Refresh the onboarding handbook', 'policy', 'normal', 'deferred', false, 'none', null, true, null, 12.00, null, 'Planning to refresh the onboarding handbook.');

  create temporary table seed_commitment_map (
    natural_key      text primary key,
    commitment_id    uuid not null,
    carried_from_key text
  ) on commit drop;

  for srow in
    select sr.*,
           p.id as profile_id, p.department_id as dept_of_person,
           cy.id as cycle_id, cy.starts_on, cy.ends_on,
           ci.id as check_in_id, dep.id as depends_dept_id
    from seed_raw sr
    join profiles p on p.org_id = v_org and p.email = sr.email
    join cycles cy on cy.org_id = v_org and cy.kind = 'week'
                  and cy.starts_on = v_anchor + (sr.week_offset * 7)
    left join check_ins ci on ci.profile_id = p.id and ci.cycle_id = cy.id
    left join departments dep on dep.org_id = v_org and dep.slug = sr.depends_dept
    order by sr.week_offset, sr.natural_key
  loop
    insert into commitments (
      org_id, profile_id, department_id, source_check_in_id, source_quote,
      extraction_confidence, title, category, priority,
      estimated_effort_hours, actual_effort_hours,
      created_cycle_id, target_cycle_id, status, was_planned,
      deviation_declared, declared_at, blocker_kind, depends_on_department_id,
      delivered_at, created_at
    )
    values (
      v_org, srow.profile_id, srow.dept_of_person, srow.check_in_id, srow.quote,
      0.900, srow.title, srow.category, srow.priority::commitment_priority,
      srow.est_hours, srow.act_hours,
      srow.cycle_id, srow.cycle_id, srow.status::commitment_status, srow.was_planned,
      srow.declared,
      case when srow.declared
           then (srow.starts_on + 2)::timestamptz + interval '11 hours'
           else null end,
      srow.blocker::blocker_kind, srow.depends_dept_id,
      case when srow.status = 'delivered'
           then (srow.ends_on - 1)::timestamptz + interval '16 hours'
           else null end,
      srow.starts_on::timestamptz + interval '9 hours'
    )
    returning id into v_cid;

    insert into seed_commitment_map (natural_key, commitment_id, carried_from_key)
    values (srow.natural_key, v_cid, srow.carried_from_key);
  end loop;

  -- stitch the rollover chain
  update commitments c
  set carried_from_commitment_id = parent.commitment_id
  from seed_commitment_map child
  join seed_commitment_map parent on parent.natural_key = child.carried_from_key
  where c.id = child.commitment_id;

  -- ---- self-report evidence for everything that landed --------------------
  insert into evidence (commitment_id, kind, source, excerpt, occurred_at, confidence,
                        asserted_by_profile_id)
  select c.id, 'self_report', 'check_in', c.source_quote,
         coalesce(c.delivered_at, c.created_at), 0.6, c.profile_id
  from commitments c
  join profiles p on p.id = c.profile_id
  where p.org_id = v_org
    and c.status in ('delivered', 'partial')
    and c.source_quote is not null;

  -- ---- reconciliations: score every completed week ------------------------
  perform refresh_reconciliation(p.id, cy.id)
  from profiles p
  cross join cycles cy
  where p.org_id = v_org
    -- Who files, not who has a department. HR sits outside the delivery units
    -- and still reports, so keying this on department_id left the one person
    -- enforcing the rhythm with no score of their own.
    and p.role in ('staff', 'lead', 'hr')
    and cy.org_id = v_org
    and cy.kind = 'week'
    and cy.starts_on < date_trunc('week', current_date)::date;

  -- Past weeks are settled history; only the most recent one is still sitting
  -- in the employee's correction window, so the demo has something live to show.
  update reconciliations r
  set status = 'auto_confirmed', confirmed_at = now()
  from cycles cy
  where cy.id = r.cycle_id
    and r.org_id = v_org
    and r.status = 'draft'
    and cy.starts_on < (date_trunc('week', current_date) - interval '1 week')::date;

  update reconciliations r
  set status = 'awaiting_employee'
  from cycles cy
  where cy.id = r.cycle_id
    and r.org_id = v_org
    and r.status = 'draft'
    and cy.starts_on = (date_trunc('week', current_date) - interval '1 week')::date;

  -- ---- notifications ------------------------------------------------------
  --
  -- Inserted directly rather than through enqueue_notification(), on purpose.
  -- That function enforces a two-a-day budget, and these are backdated across
  -- a fortnight — routing them through it would suppress almost all of them
  -- and leave the Alerts screen as empty as it was before. The budget is
  -- exercised by tests/notifications.test.ts, which is where it belongs.
  --
  -- The wording follows the PRD's own contrast: not "please submit your
  -- report", but a question that already knows what it is asking about.

  -- 1. Something a person committed to and has not resolved.
  insert into notifications (org_id, profile_id, kind, title, body,
                             action_url, action_label, priority, status,
                             sent_at, read_at, created_at)
  select
    v_org, c.profile_id, 'commitment_mismatch',
    'Is "' || c.title || '" still on track?',
    'You committed to this last week and it has not been resolved since. '
      || 'Mark it complete, delayed, or blocked and it stops chasing you.',
    '/my-week', 'Resolve it', 1, 'sent',
    now() - interval '2 days', null, now() - interval '2 days'
  from commitments c
  join profiles p on p.id = c.profile_id
  where p.org_id = v_org
    and c.status in ('promised', 'in_progress')
    and c.deleted_at is null
  order by c.created_at desc
  limit 14;

  -- 2. Blocked work, aimed at the person who can clear it.
  insert into notifications (org_id, profile_id, kind, title, body,
                             action_url, action_label, priority, status,
                             sent_at, read_at, created_at)
  select
    v_org, lead.id, 'blocker_owner',
    d.name || ' is holding up ' || own.name,
    c.owner_name || ' has been waiting on your unit since ' ||
      to_char(c.created_at, 'Mon DD') || '. One decision clears it.',
    '/departments/' || d.id, 'See the unit', 1, 'sent',
    now() - interval '1 day', null, now() - interval '1 day'
  from (
    select c.id, c.created_at, c.depends_on_department_id, c.department_id,
           p.full_name as owner_name
    from commitments c
    join profiles p on p.id = c.profile_id
    where c.status = 'blocked' and c.depends_on_department_id is not null
    order by c.created_at
    limit 4
  ) c
  join departments d on d.id = c.depends_on_department_id
  join departments own on own.id = c.department_id
  join profiles lead on lead.id = d.lead_id
  where lead.org_id = v_org;

  -- 3. The reporting rhythm itself (PRD F3), already read.
  insert into notifications (org_id, profile_id, kind, title, body,
                             action_url, action_label, priority, status,
                             sent_at, read_at, created_at)
  select
    v_org, p.id, 'checkin_reminder',
    'Your Friday standup is open',
    'It takes about thirty seconds. Last week''s commitments are already '
      || 'filled in — you only say what changed.',
    '/check-in', 'Check in', 2, 'read',
    now() - interval '5 days', now() - interval '5 days' + interval '2 hours',
    now() - interval '5 days'
  from profiles p
  where p.org_id = v_org and p.role in ('staff', 'lead');

  -- 4. What the Chairman and HR get: the digest landing, not a nudge.
  insert into notifications (org_id, profile_id, kind, title, body,
                             action_url, action_label, priority, status,
                             sent_at, read_at, created_at)
  select
    v_org, p.id, 'exec_digest',
    'This week across the organisation',
    'Delivery held, one cross-team blocker is now in its third week, and '
      || 'four commitments went quiet rather than being flagged.',
    '/dashboard', 'Read the brief', 1, 'sent',
    now() - interval '18 hours', null, now() - interval '18 hours'
  from profiles p
  where p.org_id = v_org and p.role in ('executive', 'hr', 'admin');

  -- ---- the Chairman's weekly brief ----------------------------------------
  --
  -- The digest the notification above says to go and read. Without this row
  -- the demo Chairman is told a brief exists and then finds nothing, and the
  -- welcome modal on /dashboard never appears at all.
  --
  -- Written against the MOST RECENT SETTLED cycle, never the one still inside
  -- the correction window (GUIDE section 8): a briefing on an unsettled week
  -- reports numbers its subjects have not seen.
  --
  -- The prose restates the same three narratives the reconciliation engine
  -- finds on its own — the eight-week carry, the Creative Hub dependency, the
  -- silent drops. It sits on the same screen as those findings, so anything
  -- else here would read as the system contradicting itself.
  insert into digests (org_id, scope, scope_id, period, cycle_id, status,
                       subject, summary_json, recipients, sent_at, created_at)
  select
    v_org, 'executive', null, 'weekly', cy.id, 'sent',
    'Delivery held, and Creative Hub is now blocking a second unit',
    '{
      "subject": "Delivery held, and Creative Hub is now blocking a second unit",
      "headline": "Delivery held at last week''s level, but the Creative Hub dependency is now in its third cycle and five commitments closed without anyone saying what happened to them.",
      "whatChanged": [
        "The warehouse migration has now been carried eight weeks running.",
        "Creative Hub has been blocking Techspecialist for three cycles.",
        "Five commitments across five people closed with no status update.",
        "Growth declared every deviation in time for the second week running."
      ],
      "decisions": [
        {
          "risk": "The reporting pipeline migration has moved eight weeks in a row. Each week on its own looks like a small slip; the chain is the finding.",
          "action": "Ask what the smallest shippable piece of it would be, and let the rest wait for it.",
          "concerns": "Techspecialist"
        },
        {
          "risk": "Creative Hub has held up Techspecialist for three cycles and it has not cleared on its own.",
          "action": "Put both leads in one conversation this week and name who owns the unblock.",
          "concerns": "Creative Hub"
        },
        {
          "risk": "Five commitments went quiet rather than being deferred, so the delivery figure is softer than it reads.",
          "action": "Ask what happened to those five before treating the percentage as settled."
        }
      ],
      "praise": [
        "Growth flagged every change as it happened, which is what makes their figures worth comparing."
      ],
      "threads": [
        {
          "headline": "Reporting pipeline migration to the new warehouse",
          "detail": "Still moving. It has now been carried eight weeks running, and each week on its own has looked like a small slip. Amara is carrying it into next week again.",
          "people": ["Amara Okonkwo"]
        },
        {
          "headline": "Deployment pipeline and the reconciliation endpoint",
          "detail": "Both landed. Zainab and Emeka closed the staging rollout together, and Zainab shipped the reconciliation endpoint; the retry and backoff work went in alongside it.",
          "people": ["Zainab Yusuf", "Emeka Obi"]
        },
        {
          "headline": "Design tokens and the brand assets in the app shell",
          "detail": "The token documentation is finished. The brand assets it feeds are still waiting on Creative Hub, so that piece has not moved for a third week — the people waiting are not scored down for it.",
          "people": ["Adaeze Nnamdi", "Halima Sani"]
        },
        {
          "headline": "Inbound partnership pipeline",
          "detail": "Qualified and handed on. Ifeoma and Musa worked the same list and both flagged their changes before the week closed rather than afterwards.",
          "people": ["Ifeoma Chukwu", "Musa Danjuma"]
        }
      ]
    }'::jsonb
    /*
     * silent and roster are FACTS, derived here rather than written into the
     * literal above. A hand-written non-reporter would contradict the check-in
     * rows two clicks away on that person's page, and seed data that disagrees
     * with itself is a product bug (GUIDE section 14).
     */
    || jsonb_build_object(
         'silent',
         coalesce((
           select jsonb_agg(p.full_name order by p.full_name)
           from profiles p
           where p.org_id = v_org and p.status = 'active'
             and p.role in ('staff', 'lead', 'hr')
             and not exists (
               select 1 from check_ins ci
               where ci.profile_id = p.id and ci.cycle_id = cy.id
                 and ci.responded_at is not null
             )
         ), '[]'::jsonb),
         'roster',
         coalesce((
           select jsonb_agg(jsonb_build_object('name', p.full_name, 'profileId', p.id))
           from profiles p
           where p.org_id = v_org and p.status = 'active'
             and p.role in ('staff', 'lead', 'hr')
         ), '[]'::jsonb)
       ),
    array[]::text[],
    now() - interval '18 hours', now() - interval '18 hours'
  from cycles cy
  where cy.org_id = v_org
    and cy.starts_on = (date_trunc('week', current_date) - interval '2 weeks')::date;

  raise notice 'NEXUS seed: % people, % commitments, % check-ins',
    (select count(*) from profiles where org_id = v_org),
    (select count(*) from commitments c join profiles p on p.id = c.profile_id where p.org_id = v_org),
    (select count(*) from check_ins where org_id = v_org);
end;
$seed$;
