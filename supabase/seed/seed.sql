-- ============================================================================
-- NEXUS demo seed — GENERATED FILE, do not edit by hand.
--   regenerate with:  npm run db:seed:generate
--
-- 8 weeks of history for 13 people across 4 departments,
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
      ('automation', 'Automation', '#2E2420', 'Process automation, integrations and internal tooling.'),
      ('finance', 'Finance', '#4A3C36', 'Budgeting, procurement, payables and financial control.'),
      ('marketing', 'Marketing', '#6E5E57', 'Campaigns, brand, content and demand generation.'),
      ('people', 'HR', '#9C8A84', 'Hiring, onboarding, policy and employee relations.')
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
      ('ifeanyi.obiora@nexus.invalid', 'Ifeanyi Obiora', 'automation', 'lead', 'Head of Automation'),
      ('sade.adeniyi@nexus.invalid', 'Sade Adeniyi', 'automation', 'staff', 'Automation Engineer'),
      ('rotimi.balogun@nexus.invalid', 'Rotimi Balogun', 'automation', 'staff', 'Integration Engineer'),
      ('chinaza.mbah@nexus.invalid', 'Chinaza Mbah', 'automation', 'staff', 'Data Engineer'),
      ('olusola.ajayi@nexus.invalid', 'Olusola Ajayi', 'finance', 'lead', 'Head of Finance'),
      ('grace.etim@nexus.invalid', 'Grace Etim', 'finance', 'staff', 'Financial Analyst'),
      ('temitope.oladele@nexus.invalid', 'Temitope Oladele', 'marketing', 'lead', 'Head of Marketing'),
      ('uche.nwankwo@nexus.invalid', 'Uche Nwankwo', 'marketing', 'staff', 'Campaign Manager'),
      ('aisha.lawal@nexus.invalid', 'Aisha Lawal', 'marketing', 'staff', 'Content Lead'),
      ('folake.durojaiye@nexus.invalid', 'Folake Durojaiye', 'people', 'hr', 'Head of People'),
      ('kunle.oyelaran@nexus.invalid', 'Kunle Oyelaran', 'people', 'staff', 'People Operations'),
      ('chairman@nexus.invalid', 'Adebayo Fashola', null, 'executive', 'Chairman'),
      ('admin@nexus.invalid', 'Nkechi Okafor', null, 'admin', 'IT Administrator')
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
      ('ifeanyi.obiora@nexus.invalid', 0, 'Shipped this week: Automate the monthly reconciliation run; Wire payroll exports into the data warehouse. Still in flight: Roll the supplier onboarding bot to production; Ship the invoice ingestion connector; Cut the statement-matching job below five minutes; Move the scheduler onto the new deployment pipeline; Add retry and backoff to the webhook dispatcher.'),
      ('ifeanyi.obiora@nexus.invalid', 1, 'Shipped this week: Automate the monthly reconciliation run. Still in flight: Roll the supplier onboarding bot to production; Wire payroll exports into the data warehouse; Cut the statement-matching job below five minutes; Harden the inbound email parser against malformed attachments; Rotate the production service credentials.'),
      ('ifeanyi.obiora@nexus.invalid', 2, 'Shipped this week: Wire payroll exports into the data warehouse; Add retry and backoff to the webhook dispatcher; Automate the monthly reconciliation run; Ship the invoice ingestion connector. Still in flight: Roll the supplier onboarding bot to production; Cut the statement-matching job below five minutes; Harden the inbound email parser against malformed attachments; Replace the nightly CSV drop with a live feed.'),
      ('ifeanyi.obiora@nexus.invalid', 3, 'Shipped this week: Wire payroll exports into the data warehouse; Rotate the production service credentials. Still in flight: Roll the supplier onboarding bot to production; Set up alerting for failed overnight jobs; Move the scheduler onto the new deployment pipeline; Ship the invoice ingestion connector; Replace the nightly CSV drop with a live feed.'),
      ('ifeanyi.obiora@nexus.invalid', 4, 'Shipped this week: Set up alerting for failed overnight jobs; Cut the statement-matching job below five minutes. Still in flight: Roll the supplier onboarding bot to production; Rotate the production service credentials; Move the scheduler onto the new deployment pipeline; Automate the monthly reconciliation run; Add retry and backoff to the webhook dispatcher.'),
      ('ifeanyi.obiora@nexus.invalid', 5, 'Shipped this week: Cut the statement-matching job below five minutes. Still in flight: Roll the supplier onboarding bot to production; Wire payroll exports into the data warehouse; Replace the nightly CSV drop with a live feed; Set up alerting for failed overnight jobs; Automate the monthly reconciliation run; Rotate the production service credentials.'),
      ('ifeanyi.obiora@nexus.invalid', 6, 'Shipped this week: Wire payroll exports into the data warehouse; Rotate the production service credentials. Still in flight: Roll the supplier onboarding bot to production; Ship the invoice ingestion connector; Harden the inbound email parser against malformed attachments; Add retry and backoff to the webhook dispatcher.'),
      ('ifeanyi.obiora@nexus.invalid', 7, 'Shipped this week: Roll the supplier onboarding bot to production; Automate the monthly reconciliation run; Add retry and backoff to the webhook dispatcher; Harden the inbound email parser against malformed attachments. Still in flight: Set up alerting for failed overnight jobs; Wire payroll exports into the data warehouse; Rotate the production service credentials.'),
      ('sade.adeniyi@nexus.invalid', 0, 'Shipped this week: Set up alerting for failed overnight jobs; Replace the nightly CSV drop with a live feed. Blocked on Wait on Finance to licence the RPA platform; Hold the campaign flight until the Q4 budget is released — waiting on Finance to sign off.'),
      ('sade.adeniyi@nexus.invalid', 1, 'Shipped this week: Replace the nightly CSV drop with a live feed; Automate the monthly reconciliation run. Blocked on Wait on Finance to licence the RPA platform; Hold the campaign flight until the Q4 budget is released — waiting on Finance to sign off.'),
      ('sade.adeniyi@nexus.invalid', 2, 'Shipped this week: Cut the statement-matching job below five minutes. Blocked on Wait on Finance to licence the RPA platform; Hold the campaign flight until the Q4 budget is released — waiting on Finance to sign off.'),
      ('sade.adeniyi@nexus.invalid', 3, 'Shipped this week: Set up alerting for failed overnight jobs. Blocked on Wait on Finance to licence the RPA platform; Hold the campaign flight until the Q4 budget is released — waiting on Finance to sign off. Still in flight: Rotate the production service credentials.'),
      ('sade.adeniyi@nexus.invalid', 4, 'Shipped this week: Move the scheduler onto the new deployment pipeline. Blocked on Wait on Finance to licence the RPA platform; Hold the campaign flight until the Q4 budget is released — waiting on Finance to sign off.'),
      ('sade.adeniyi@nexus.invalid', 5, 'Shipped this week: Set up alerting for failed overnight jobs; Ship the invoice ingestion connector; Harden the inbound email parser against malformed attachments. Blocked on Wait on Finance to licence the RPA platform; Hold the campaign flight until the Q4 budget is released — waiting on Finance to sign off.'),
      ('sade.adeniyi@nexus.invalid', 6, 'Shipped this week: Automate the monthly reconciliation run. Blocked on Wait on Finance to licence the RPA platform; Hold the campaign flight until the Q4 budget is released — waiting on Finance to sign off.'),
      ('sade.adeniyi@nexus.invalid', 7, 'Shipped this week: Add retry and backoff to the webhook dispatcher. Blocked on Wait on Finance to licence the RPA platform; Hold the campaign flight until the Q4 budget is released — waiting on Finance to sign off. Still in flight: Set up alerting for failed overnight jobs.'),
      ('rotimi.balogun@nexus.invalid', 0, 'Shipped this week: Replace the nightly CSV drop with a live feed; Cut the statement-matching job below five minutes. Still in flight: Move the scheduler onto the new deployment pipeline.'),
      ('rotimi.balogun@nexus.invalid', 1, 'Shipped this week: Harden the inbound email parser against malformed attachments; Set up alerting for failed overnight jobs. Still in flight: Ship the invoice ingestion connector.'),
      ('rotimi.balogun@nexus.invalid', 2, 'Shipped this week: Automate the monthly reconciliation run; Rotate the production service credentials; Cut the statement-matching job below five minutes. Still in flight: Harden the inbound email parser against malformed attachments.'),
      ('rotimi.balogun@nexus.invalid', 3, 'Shipped this week: Ship the invoice ingestion connector; Cut the statement-matching job below five minutes. Still in flight: Set up alerting for failed overnight jobs; Rotate the production service credentials.'),
      ('rotimi.balogun@nexus.invalid', 4, 'Shipped this week: Harden the inbound email parser against malformed attachments; Cut the statement-matching job below five minutes; Wire payroll exports into the data warehouse. Still in flight: Automate the monthly reconciliation run.'),
      ('rotimi.balogun@nexus.invalid', 5, 'Shipped this week: Automate the monthly reconciliation run; Add retry and backoff to the webhook dispatcher. Still in flight: Set up alerting for failed overnight jobs; Ship the invoice ingestion connector.'),
      ('rotimi.balogun@nexus.invalid', 6, 'Shipped this week: Rotate the production service credentials; Harden the inbound email parser against malformed attachments; Ship the invoice ingestion connector; Add retry and backoff to the webhook dispatcher; Automate the monthly reconciliation run.'),
      ('rotimi.balogun@nexus.invalid', 7, 'Shipped this week: Harden the inbound email parser against malformed attachments; Ship the invoice ingestion connector; Cut the statement-matching job below five minutes; Add retry and backoff to the webhook dispatcher. Still in flight: Wire payroll exports into the data warehouse.'),
      ('chinaza.mbah@nexus.invalid', 0, 'Shipped this week: Wire payroll exports into the data warehouse; Automate the monthly reconciliation run. Blocked on Wait on HR to sign off the employee data handling policy; Hold the onboarding bot until the data policy lands — waiting on HR to sign off. Still in flight: Ship the invoice ingestion connector.'),
      ('chinaza.mbah@nexus.invalid', 1, 'Shipped this week: Add retry and backoff to the webhook dispatcher; Rotate the production service credentials. Blocked on Wait on HR to sign off the employee data handling policy; Hold the onboarding bot until the data policy lands — waiting on HR to sign off.'),
      ('chinaza.mbah@nexus.invalid', 2, 'Shipped this week: Set up alerting for failed overnight jobs. Blocked on Wait on HR to sign off the employee data handling policy; Hold the onboarding bot until the data policy lands — waiting on HR to sign off. Still in flight: Replace the nightly CSV drop with a live feed; Harden the inbound email parser against malformed attachments.'),
      ('chinaza.mbah@nexus.invalid', 3, 'Shipped this week: Replace the nightly CSV drop with a live feed. Blocked on Wait on HR to sign off the employee data handling policy; Hold the onboarding bot until the data policy lands — waiting on HR to sign off.'),
      ('chinaza.mbah@nexus.invalid', 4, 'Shipped this week: Replace the nightly CSV drop with a live feed. Blocked on Wait on HR to sign off the employee data handling policy; Hold the onboarding bot until the data policy lands — waiting on HR to sign off. Still in flight: Automate the monthly reconciliation run.'),
      ('chinaza.mbah@nexus.invalid', 5, 'Blocked on Wait on HR to sign off the employee data handling policy; Hold the onboarding bot until the data policy lands — waiting on HR to sign off. Still in flight: Wire payroll exports into the data warehouse; Cut the statement-matching job below five minutes.'),
      ('chinaza.mbah@nexus.invalid', 6, 'Shipped this week: Wire payroll exports into the data warehouse; Ship the invoice ingestion connector. Blocked on Wait on HR to sign off the employee data handling policy; Hold the onboarding bot until the data policy lands — waiting on HR to sign off.'),
      ('chinaza.mbah@nexus.invalid', 7, 'Shipped this week: Rotate the production service credentials. Blocked on Wait on HR to sign off the employee data handling policy; Hold the onboarding bot until the data policy lands — waiting on HR to sign off.'),
      ('olusola.ajayi@nexus.invalid', 0, 'Shipped this week: Rebuild the cash-flow forecast model; Finish the quarterly VAT return; Close the September management accounts.'),
      ('olusola.ajayi@nexus.invalid', 1, 'Shipped this week: Renegotiate the payment terms with the two largest suppliers; Close the September management accounts. Still in flight: Release the Q4 campaign budget; Reconcile the supplier statements for Q3.'),
      ('olusola.ajayi@nexus.invalid', 2, 'Shipped this week: Renegotiate the payment terms with the two largest suppliers; Reconcile the supplier statements for Q3; Release the Q4 campaign budget. Still in flight: Settle the outstanding vendor invoices.'),
      ('olusola.ajayi@nexus.invalid', 3, 'Shipped this week: Finish the quarterly VAT return; Release the Q4 campaign budget. Still in flight: Rebuild the cash-flow forecast model.'),
      ('olusola.ajayi@nexus.invalid', 4, 'Shipped this week: Approve the RPA licence renewal; Release the Q4 campaign budget. Still in flight: Finish the quarterly VAT return.'),
      ('olusola.ajayi@nexus.invalid', 5, 'Shipped this week: Settle the outstanding vendor invoices; Approve the RPA licence renewal; Rebuild the cash-flow forecast model; Reconcile the supplier statements for Q3.'),
      ('olusola.ajayi@nexus.invalid', 6, 'Shipped this week: Finish the quarterly VAT return; Approve the RPA licence renewal; Rebuild the cash-flow forecast model.'),
      ('olusola.ajayi@nexus.invalid', 7, 'Shipped this week: Rebuild the cash-flow forecast model. Still in flight: Release the Q4 campaign budget; Reconcile the supplier statements for Q3.'),
      ('grace.etim@nexus.invalid', 1, 'Shipped this week: Approve the RPA licence renewal; Rebuild the cash-flow forecast model. Still in flight: Renegotiate the payment terms with the two largest suppliers; Release the Q4 campaign budget.'),
      ('grace.etim@nexus.invalid', 2, 'Shipped this week: Rebuild the cash-flow forecast model; Approve the RPA licence renewal. Still in flight: Renegotiate the payment terms with the two largest suppliers.'),
      ('grace.etim@nexus.invalid', 3, 'Shipped this week: Renegotiate the payment terms with the two largest suppliers; Settle the outstanding vendor invoices; Finish the quarterly VAT return; Rebuild the cash-flow forecast model.'),
      ('grace.etim@nexus.invalid', 4, 'Shipped this week: Settle the outstanding vendor invoices; Finish the quarterly VAT return. Still in flight: Close the September management accounts.'),
      ('grace.etim@nexus.invalid', 5, 'Shipped this week: Release the Q4 campaign budget. Still in flight: Close the September management accounts; Finish the quarterly VAT return.'),
      ('grace.etim@nexus.invalid', 6, 'Shipped this week: Renegotiate the payment terms with the two largest suppliers; Reconcile the supplier statements for Q3; Settle the outstanding vendor invoices. Still in flight: Rebuild the cash-flow forecast model.'),
      ('grace.etim@nexus.invalid', 7, 'Shipped this week: Finish the quarterly VAT return; Rebuild the cash-flow forecast model; Approve the RPA licence renewal. Still in flight: Close the September management accounts.'),
      ('temitope.oladele@nexus.invalid', 0, 'Still in flight: Ship the campaign landing page; Rewrite the onboarding email sequence; Book the paid media flight for October.'),
      ('temitope.oladele@nexus.invalid', 1, 'Shipped this week: Publish the October editorial calendar. Still in flight: Produce the product launch explainer; Launch the Q4 demand campaign; Run the customer story interviews.'),
      ('temitope.oladele@nexus.invalid', 2, 'Shipped this week: Run the customer story interviews; Ship the campaign landing page. Still in flight: Book the paid media flight for October; Rewrite the onboarding email sequence.'),
      ('temitope.oladele@nexus.invalid', 3, 'Shipped this week: Book the paid media flight for October; Publish the October editorial calendar; Rewrite the onboarding email sequence. Still in flight: Produce the product launch explainer; Ship the campaign landing page.'),
      ('temitope.oladele@nexus.invalid', 4, 'Shipped this week: Produce the product launch explainer; Book the paid media flight for October; Ship the campaign landing page. Still in flight: Launch the Q4 demand campaign.'),
      ('temitope.oladele@nexus.invalid', 5, 'Shipped this week: Publish the October editorial calendar. Still in flight: Book the paid media flight for October; Launch the Q4 demand campaign.'),
      ('temitope.oladele@nexus.invalid', 6, 'Shipped this week: Run the customer story interviews; Ship the campaign landing page; Rewrite the onboarding email sequence. Still in flight: Publish the October editorial calendar; Book the paid media flight for October.'),
      ('temitope.oladele@nexus.invalid', 7, 'Shipped this week: Book the paid media flight for October; Launch the Q4 demand campaign; Ship the campaign landing page. Still in flight: Run the customer story interviews; Rewrite the onboarding email sequence.'),
      ('uche.nwankwo@nexus.invalid', 0, 'Blocked on Wait on Finance to licence the RPA platform; Hold the campaign flight until the Q4 budget is released — waiting on Finance to sign off. Still in flight: Rewrite the onboarding email sequence; Run the customer story interviews.'),
      ('uche.nwankwo@nexus.invalid', 1, 'Shipped this week: Produce the product launch explainer. Blocked on Wait on Finance to licence the RPA platform; Hold the campaign flight until the Q4 budget is released — waiting on Finance to sign off. Still in flight: Run the customer story interviews.'),
      ('uche.nwankwo@nexus.invalid', 2, 'Shipped this week: Launch the Q4 demand campaign; Book the paid media flight for October. Blocked on Wait on Finance to licence the RPA platform; Hold the campaign flight until the Q4 budget is released — waiting on Finance to sign off.'),
      ('uche.nwankwo@nexus.invalid', 3, 'Shipped this week: Book the paid media flight for October. Blocked on Wait on Finance to licence the RPA platform; Hold the campaign flight until the Q4 budget is released — waiting on Finance to sign off. Still in flight: Ship the campaign landing page.'),
      ('uche.nwankwo@nexus.invalid', 4, 'Shipped this week: Rewrite the onboarding email sequence. Blocked on Wait on Finance to licence the RPA platform; Hold the campaign flight until the Q4 budget is released — waiting on Finance to sign off.'),
      ('uche.nwankwo@nexus.invalid', 5, 'Blocked on Wait on Finance to licence the RPA platform; Hold the campaign flight until the Q4 budget is released — waiting on Finance to sign off. Still in flight: Rewrite the onboarding email sequence.'),
      ('uche.nwankwo@nexus.invalid', 6, 'Shipped this week: Launch the Q4 demand campaign. Blocked on Wait on Finance to licence the RPA platform; Hold the campaign flight until the Q4 budget is released — waiting on Finance to sign off. Still in flight: Produce the product launch explainer.'),
      ('uche.nwankwo@nexus.invalid', 7, 'Blocked on Wait on Finance to licence the RPA platform; Hold the campaign flight until the Q4 budget is released — waiting on Finance to sign off. Still in flight: Launch the Q4 demand campaign; Publish the October editorial calendar.'),
      ('aisha.lawal@nexus.invalid', 0, 'Shipped this week: Launch the Q4 demand campaign; Produce the product launch explainer; Book the paid media flight for October.'),
      ('aisha.lawal@nexus.invalid', 1, 'Shipped this week: Book the paid media flight for October; Launch the Q4 demand campaign; Run the customer story interviews; Publish the October editorial calendar.'),
      ('aisha.lawal@nexus.invalid', 2, 'Shipped this week: Book the paid media flight for October; Run the customer story interviews; Launch the Q4 demand campaign.'),
      ('aisha.lawal@nexus.invalid', 3, 'Shipped this week: Launch the Q4 demand campaign; Rewrite the onboarding email sequence; Produce the product launch explainer. Still in flight: Run the customer story interviews.'),
      ('aisha.lawal@nexus.invalid', 4, 'Shipped this week: Run the customer story interviews; Rewrite the onboarding email sequence. Still in flight: Book the paid media flight for October.'),
      ('aisha.lawal@nexus.invalid', 5, 'Shipped this week: Run the customer story interviews; Rewrite the onboarding email sequence; Launch the Q4 demand campaign; Publish the October editorial calendar.'),
      ('aisha.lawal@nexus.invalid', 6, 'Shipped this week: Launch the Q4 demand campaign; Book the paid media flight for October. Still in flight: Ship the campaign landing page.'),
      ('aisha.lawal@nexus.invalid', 7, 'Shipped this week: Ship the campaign landing page; Publish the October editorial calendar. Still in flight: Launch the Q4 demand campaign; Produce the product launch explainer.'),
      ('folake.durojaiye@nexus.invalid', 0, 'Shipped this week: Handle the escalated grievance case. Still in flight: Sign off the employee data handling policy.'),
      ('folake.durojaiye@nexus.invalid', 1, 'Shipped this week: Handle the escalated grievance case; Complete the quarterly right-to-work checks; Cover the unplanned exit interview and handover; Close out the two open engineering offers; Pull the headcount numbers for the board meeting.'),
      ('folake.durojaiye@nexus.invalid', 2, 'Shipped this week: Run the interview panel calibration session; Handle the escalated grievance case; Complete the quarterly right-to-work checks. Still in flight: Publish the updated role scorecards.'),
      ('folake.durojaiye@nexus.invalid', 3, 'Shipped this week: Handle the escalated grievance case; Refresh the onboarding handbook; Finish the annual leave policy update; Cover the unplanned exit interview and handover. Still in flight: Close out the two open engineering offers.'),
      ('folake.durojaiye@nexus.invalid', 4, 'Shipped this week: Handle the escalated grievance case; Cover the unplanned exit interview and handover; Sign off the employee data handling policy; Pull the headcount numbers for the board meeting; Re-run payroll checks after the supplier error.'),
      ('folake.durojaiye@nexus.invalid', 5, 'Shipped this week: Handle the escalated grievance case; Cover the unplanned exit interview and handover; Refresh the onboarding handbook. Still in flight: Run the interview panel calibration session.'),
      ('folake.durojaiye@nexus.invalid', 6, 'Shipped this week: Handle the escalated grievance case. Still in flight: Run the interview panel calibration session.'),
      ('kunle.oyelaran@nexus.invalid', 0, 'Shipped this week: Finish the annual leave policy update; Publish the updated role scorecards; Close out the two open engineering offers; Sign off the employee data handling policy. Still in flight: Complete the quarterly right-to-work checks.'),
      ('kunle.oyelaran@nexus.invalid', 1, 'Shipped this week: Publish the updated role scorecards; Run the interview panel calibration session. Still in flight: Finish the annual leave policy update.'),
      ('kunle.oyelaran@nexus.invalid', 2, 'Shipped this week: Sign off the employee data handling policy; Run the interview panel calibration session. Still in flight: Close out the two open engineering offers; Finish the annual leave policy update.'),
      ('kunle.oyelaran@nexus.invalid', 4, 'Shipped this week: Refresh the onboarding handbook; Publish the updated role scorecards. Still in flight: Close out the two open engineering offers.'),
      ('kunle.oyelaran@nexus.invalid', 5, 'Shipped this week: Sign off the employee data handling policy. Still in flight: Publish the updated role scorecards; Close out the two open engineering offers.'),
      ('kunle.oyelaran@nexus.invalid', 6, 'Shipped this week: Finish the annual leave policy update; Close out the two open engineering offers; Refresh the onboarding handbook. Still in flight: Sign off the employee data handling policy.'),
      ('kunle.oyelaran@nexus.invalid', 7, 'Shipped this week: Close out the two open engineering offers. Still in flight: Publish the updated role scorecards; Finish the annual leave policy update.')
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
      ('ifeanyi.obiora@nexus.invalid|0|0', 'ifeanyi.obiora@nexus.invalid', 0, 'Roll the supplier onboarding bot to production', 'backend', 'high', 'partial', true, 'none', null, true, null, 12.00, 12.40, 'Planning to roll the supplier onboarding bot to production.'),
      ('ifeanyi.obiora@nexus.invalid|0|1', 'ifeanyi.obiora@nexus.invalid', 0, 'Automate the monthly reconciliation run', 'bots', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 6.00, 'Finished automate the monthly reconciliation run this week.'),
      ('ifeanyi.obiora@nexus.invalid|0|2', 'ifeanyi.obiora@nexus.invalid', 0, 'Wire payroll exports into the data warehouse', 'integration', 'normal', 'delivered', false, 'none', null, true, null, 3.00, 3.30, 'Finished wire payroll exports into the data warehouse this week.'),
      ('ifeanyi.obiora@nexus.invalid|0|3', 'ifeanyi.obiora@nexus.invalid', 0, 'Ship the invoice ingestion connector', 'integration', 'normal', 'in_progress', false, 'none', null, true, null, 6.00, null, 'Planning to ship the invoice ingestion connector.'),
      ('ifeanyi.obiora@nexus.invalid|0|4', 'ifeanyi.obiora@nexus.invalid', 0, 'Cut the statement-matching job below five minutes', 'bots', 'high', 'deferred', false, 'none', null, true, null, 8.00, null, 'Planning to cut the statement-matching job below five minutes.'),
      ('ifeanyi.obiora@nexus.invalid|0|5', 'ifeanyi.obiora@nexus.invalid', 0, 'Move the scheduler onto the new deployment pipeline', 'platform', 'normal', 'in_progress', true, 'none', null, true, null, 3.00, null, 'Planning to move the scheduler onto the new deployment pipeline.'),
      ('ifeanyi.obiora@nexus.invalid|0|6', 'ifeanyi.obiora@nexus.invalid', 0, 'Add retry and backoff to the webhook dispatcher', 'integration', 'normal', 'deferred', false, 'none', null, true, null, 8.00, null, 'Planning to add retry and backoff to the webhook dispatcher.'),
      ('ifeanyi.obiora@nexus.invalid|1|0', 'ifeanyi.obiora@nexus.invalid', 1, 'Roll the supplier onboarding bot to production', 'backend', 'high', 'partial', true, 'none', null, true, 'ifeanyi.obiora@nexus.invalid|0|0', 7.00, 7.40, 'Planning to roll the supplier onboarding bot to production.'),
      ('ifeanyi.obiora@nexus.invalid|1|1', 'ifeanyi.obiora@nexus.invalid', 1, 'Wire payroll exports into the data warehouse', 'integration', 'normal', 'partial', true, 'none', null, true, null, 5.00, 4.80, 'Planning to wire payroll exports into the data warehouse.'),
      ('ifeanyi.obiora@nexus.invalid|1|2', 'ifeanyi.obiora@nexus.invalid', 1, 'Cut the statement-matching job below five minutes', 'bots', 'high', 'in_progress', false, 'none', null, true, null, 11.00, null, 'Planning to cut the statement-matching job below five minutes.'),
      ('ifeanyi.obiora@nexus.invalid|1|3', 'ifeanyi.obiora@nexus.invalid', 1, 'Automate the monthly reconciliation run', 'bots', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 7.50, 'Finished automate the monthly reconciliation run this week.'),
      ('ifeanyi.obiora@nexus.invalid|1|4', 'ifeanyi.obiora@nexus.invalid', 1, 'Harden the inbound email parser against malformed attachments', 'integration', 'normal', 'deferred', false, 'none', null, true, null, 7.00, null, 'Planning to harden the inbound email parser against malformed attachments.'),
      ('ifeanyi.obiora@nexus.invalid|1|5', 'ifeanyi.obiora@nexus.invalid', 1, 'Rotate the production service credentials', 'platform', 'normal', 'deferred', true, 'none', null, true, null, 7.00, null, 'Planning to rotate the production service credentials.'),
      ('ifeanyi.obiora@nexus.invalid|2|0', 'ifeanyi.obiora@nexus.invalid', 2, 'Roll the supplier onboarding bot to production', 'backend', 'high', 'partial', false, 'none', null, true, 'ifeanyi.obiora@nexus.invalid|1|0', 10.00, 9.40, 'Planning to roll the supplier onboarding bot to production.'),
      ('ifeanyi.obiora@nexus.invalid|2|1', 'ifeanyi.obiora@nexus.invalid', 2, 'Wire payroll exports into the data warehouse', 'integration', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 6.50, 'Finished wire payroll exports into the data warehouse this week.'),
      ('ifeanyi.obiora@nexus.invalid|2|2', 'ifeanyi.obiora@nexus.invalid', 2, 'Cut the statement-matching job below five minutes', 'bots', 'high', 'deferred', false, 'none', null, true, null, 11.00, null, 'Planning to cut the statement-matching job below five minutes.'),
      ('ifeanyi.obiora@nexus.invalid|2|3', 'ifeanyi.obiora@nexus.invalid', 2, 'Harden the inbound email parser against malformed attachments', 'integration', 'normal', 'partial', false, 'none', null, true, null, 7.00, 6.40, 'Planning to harden the inbound email parser against malformed attachments.'),
      ('ifeanyi.obiora@nexus.invalid|2|4', 'ifeanyi.obiora@nexus.invalid', 2, 'Add retry and backoff to the webhook dispatcher', 'integration', 'high', 'delivered', false, 'none', null, true, null, 12.00, 13.80, 'Finished add retry and backoff to the webhook dispatcher this week.'),
      ('ifeanyi.obiora@nexus.invalid|2|5', 'ifeanyi.obiora@nexus.invalid', 2, 'Automate the monthly reconciliation run', 'bots', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 6.80, 'Finished automate the monthly reconciliation run this week.'),
      ('ifeanyi.obiora@nexus.invalid|2|6', 'ifeanyi.obiora@nexus.invalid', 2, 'Ship the invoice ingestion connector', 'integration', 'high', 'delivered', false, 'none', null, true, null, 12.00, 11.70, 'Finished ship the invoice ingestion connector this week.'),
      ('ifeanyi.obiora@nexus.invalid|2|7', 'ifeanyi.obiora@nexus.invalid', 2, 'Replace the nightly CSV drop with a live feed', 'integration', 'normal', 'partial', false, 'none', null, true, null, 7.00, 7.80, 'Planning to replace the nightly csv drop with a live feed.'),
      ('ifeanyi.obiora@nexus.invalid|3|0', 'ifeanyi.obiora@nexus.invalid', 3, 'Roll the supplier onboarding bot to production', 'backend', 'high', 'in_progress', true, 'none', null, true, 'ifeanyi.obiora@nexus.invalid|2|0', 7.00, null, 'Planning to roll the supplier onboarding bot to production.'),
      ('ifeanyi.obiora@nexus.invalid|3|1', 'ifeanyi.obiora@nexus.invalid', 3, 'Set up alerting for failed overnight jobs', 'platform', 'normal', 'deferred', true, 'none', null, true, null, 4.00, null, 'Planning to set up alerting for failed overnight jobs.'),
      ('ifeanyi.obiora@nexus.invalid|3|2', 'ifeanyi.obiora@nexus.invalid', 3, 'Move the scheduler onto the new deployment pipeline', 'platform', 'normal', 'in_progress', false, 'none', null, true, null, 12.00, null, 'Planning to move the scheduler onto the new deployment pipeline.'),
      ('ifeanyi.obiora@nexus.invalid|3|3', 'ifeanyi.obiora@nexus.invalid', 3, 'Ship the invoice ingestion connector', 'integration', 'high', 'in_progress', false, 'none', null, true, null, 12.00, null, 'Planning to ship the invoice ingestion connector.'),
      ('ifeanyi.obiora@nexus.invalid|3|4', 'ifeanyi.obiora@nexus.invalid', 3, 'Replace the nightly CSV drop with a live feed', 'integration', 'normal', 'in_progress', false, 'none', null, true, null, 14.00, null, 'Planning to replace the nightly csv drop with a live feed.'),
      ('ifeanyi.obiora@nexus.invalid|3|5', 'ifeanyi.obiora@nexus.invalid', 3, 'Wire payroll exports into the data warehouse', 'integration', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 10.70, 'Finished wire payroll exports into the data warehouse this week.'),
      ('ifeanyi.obiora@nexus.invalid|3|6', 'ifeanyi.obiora@nexus.invalid', 3, 'Rotate the production service credentials', 'platform', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 9.20, 'Finished rotate the production service credentials this week.'),
      ('ifeanyi.obiora@nexus.invalid|4|0', 'ifeanyi.obiora@nexus.invalid', 4, 'Roll the supplier onboarding bot to production', 'backend', 'high', 'partial', true, 'none', null, true, 'ifeanyi.obiora@nexus.invalid|3|0', 5.00, 4.90, 'Planning to roll the supplier onboarding bot to production.'),
      ('ifeanyi.obiora@nexus.invalid|4|1', 'ifeanyi.obiora@nexus.invalid', 4, 'Set up alerting for failed overnight jobs', 'platform', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 10.00, 'Finished set up alerting for failed overnight jobs this week.'),
      ('ifeanyi.obiora@nexus.invalid|4|2', 'ifeanyi.obiora@nexus.invalid', 4, 'Cut the statement-matching job below five minutes', 'bots', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 5.40, 'Finished cut the statement-matching job below five minutes this week.'),
      ('ifeanyi.obiora@nexus.invalid|4|3', 'ifeanyi.obiora@nexus.invalid', 4, 'Rotate the production service credentials', 'platform', 'normal', 'partial', true, 'none', null, true, null, 8.00, 8.90, 'Planning to rotate the production service credentials.'),
      ('ifeanyi.obiora@nexus.invalid|4|4', 'ifeanyi.obiora@nexus.invalid', 4, 'Move the scheduler onto the new deployment pipeline', 'platform', 'normal', 'partial', true, 'none', null, true, null, 11.00, 9.80, 'Planning to move the scheduler onto the new deployment pipeline.'),
      ('ifeanyi.obiora@nexus.invalid|4|5', 'ifeanyi.obiora@nexus.invalid', 4, 'Automate the monthly reconciliation run', 'bots', 'critical', 'partial', true, 'none', null, true, null, 12.00, 13.10, 'Planning to automate the monthly reconciliation run.'),
      ('ifeanyi.obiora@nexus.invalid|4|6', 'ifeanyi.obiora@nexus.invalid', 4, 'Add retry and backoff to the webhook dispatcher', 'integration', 'normal', 'deferred', false, 'none', null, true, null, 14.00, null, 'Planning to add retry and backoff to the webhook dispatcher.'),
      ('ifeanyi.obiora@nexus.invalid|5|0', 'ifeanyi.obiora@nexus.invalid', 5, 'Roll the supplier onboarding bot to production', 'backend', 'high', 'in_progress', false, 'none', null, true, 'ifeanyi.obiora@nexus.invalid|4|0', 14.00, null, 'Planning to roll the supplier onboarding bot to production.'),
      ('ifeanyi.obiora@nexus.invalid|5|1', 'ifeanyi.obiora@nexus.invalid', 5, 'Wire payroll exports into the data warehouse', 'integration', 'normal', 'deferred', false, 'none', null, true, null, 10.00, null, 'Planning to wire payroll exports into the data warehouse.'),
      ('ifeanyi.obiora@nexus.invalid|5|2', 'ifeanyi.obiora@nexus.invalid', 5, 'Cut the statement-matching job below five minutes', 'bots', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 11.30, 'Finished cut the statement-matching job below five minutes this week.'),
      ('ifeanyi.obiora@nexus.invalid|5|3', 'ifeanyi.obiora@nexus.invalid', 5, 'Replace the nightly CSV drop with a live feed', 'integration', 'normal', 'in_progress', false, 'none', null, true, null, 4.00, null, 'Planning to replace the nightly csv drop with a live feed.'),
      ('ifeanyi.obiora@nexus.invalid|5|4', 'ifeanyi.obiora@nexus.invalid', 5, 'Set up alerting for failed overnight jobs', 'platform', 'normal', 'partial', true, 'none', null, true, null, 12.00, 12.80, 'Planning to set up alerting for failed overnight jobs.'),
      ('ifeanyi.obiora@nexus.invalid|5|5', 'ifeanyi.obiora@nexus.invalid', 5, 'Automate the monthly reconciliation run', 'bots', 'normal', 'partial', false, 'none', null, true, null, 5.00, 4.40, 'Planning to automate the monthly reconciliation run.'),
      ('ifeanyi.obiora@nexus.invalid|5|6', 'ifeanyi.obiora@nexus.invalid', 5, 'Rotate the production service credentials', 'platform', 'normal', 'partial', false, 'none', null, true, null, 11.00, 11.70, 'Planning to rotate the production service credentials.'),
      ('ifeanyi.obiora@nexus.invalid|6|0', 'ifeanyi.obiora@nexus.invalid', 6, 'Roll the supplier onboarding bot to production', 'backend', 'high', 'in_progress', true, 'none', null, true, 'ifeanyi.obiora@nexus.invalid|5|0', 11.00, null, 'Planning to roll the supplier onboarding bot to production.'),
      ('ifeanyi.obiora@nexus.invalid|6|1', 'ifeanyi.obiora@nexus.invalid', 6, 'Ship the invoice ingestion connector', 'integration', 'normal', 'in_progress', true, 'none', null, true, null, 11.00, null, 'Planning to ship the invoice ingestion connector.'),
      ('ifeanyi.obiora@nexus.invalid|6|2', 'ifeanyi.obiora@nexus.invalid', 6, 'Harden the inbound email parser against malformed attachments', 'integration', 'normal', 'partial', true, 'none', null, true, null, 5.00, 4.80, 'Planning to harden the inbound email parser against malformed attachments.'),
      ('ifeanyi.obiora@nexus.invalid|6|3', 'ifeanyi.obiora@nexus.invalid', 6, 'Wire payroll exports into the data warehouse', 'integration', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 10.70, 'Finished wire payroll exports into the data warehouse this week.'),
      ('ifeanyi.obiora@nexus.invalid|6|4', 'ifeanyi.obiora@nexus.invalid', 6, 'Rotate the production service credentials', 'platform', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 7.70, 'Finished rotate the production service credentials this week.'),
      ('ifeanyi.obiora@nexus.invalid|6|5', 'ifeanyi.obiora@nexus.invalid', 6, 'Add retry and backoff to the webhook dispatcher', 'integration', 'normal', 'in_progress', false, 'none', null, true, null, 7.00, null, 'Planning to add retry and backoff to the webhook dispatcher.'),
      ('ifeanyi.obiora@nexus.invalid|7|0', 'ifeanyi.obiora@nexus.invalid', 7, 'Roll the supplier onboarding bot to production', 'backend', 'high', 'delivered', false, 'none', null, true, 'ifeanyi.obiora@nexus.invalid|6|0', 9.00, 10.10, 'Finished roll the supplier onboarding bot to production this week.'),
      ('ifeanyi.obiora@nexus.invalid|7|1', 'ifeanyi.obiora@nexus.invalid', 7, 'Automate the monthly reconciliation run', 'bots', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 7.30, 'Finished automate the monthly reconciliation run this week.'),
      ('ifeanyi.obiora@nexus.invalid|7|2', 'ifeanyi.obiora@nexus.invalid', 7, 'Set up alerting for failed overnight jobs', 'platform', 'critical', 'deferred', false, 'none', null, true, null, 8.00, null, 'Planning to set up alerting for failed overnight jobs.'),
      ('ifeanyi.obiora@nexus.invalid|7|3', 'ifeanyi.obiora@nexus.invalid', 7, 'Add retry and backoff to the webhook dispatcher', 'integration', 'normal', 'delivered', false, 'none', null, true, null, 3.00, 2.70, 'Finished add retry and backoff to the webhook dispatcher this week.'),
      ('ifeanyi.obiora@nexus.invalid|7|4', 'ifeanyi.obiora@nexus.invalid', 7, 'Wire payroll exports into the data warehouse', 'integration', 'normal', 'in_progress', false, 'none', null, true, null, 12.00, null, 'Planning to wire payroll exports into the data warehouse.'),
      ('ifeanyi.obiora@nexus.invalid|7|5', 'ifeanyi.obiora@nexus.invalid', 7, 'Harden the inbound email parser against malformed attachments', 'integration', 'critical', 'delivered', false, 'none', null, true, null, 6.00, 5.90, 'Finished harden the inbound email parser against malformed attachments this week.'),
      ('ifeanyi.obiora@nexus.invalid|7|6', 'ifeanyi.obiora@nexus.invalid', 7, 'Rotate the production service credentials', 'platform', 'normal', 'deferred', true, 'none', null, true, null, 6.00, null, 'Planning to rotate the production service credentials.'),
      ('sade.adeniyi@nexus.invalid|0|0', 'sade.adeniyi@nexus.invalid', 0, 'Wait on Finance to licence the RPA platform', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 10.00, null, 'Still stuck on wait on finance to licence the rpa platform — waiting on Finance.'),
      ('sade.adeniyi@nexus.invalid|0|1', 'sade.adeniyi@nexus.invalid', 0, 'Hold the campaign flight until the Q4 budget is released', 'campaign', 'high', 'blocked', true, 'external_team', 'finance', true, null, 11.00, null, 'Still stuck on hold the campaign flight until the q4 budget is released — waiting on Finance.'),
      ('sade.adeniyi@nexus.invalid|0|2', 'sade.adeniyi@nexus.invalid', 0, 'Set up alerting for failed overnight jobs', 'platform', 'high', 'delivered', false, 'none', null, true, null, 4.00, 4.20, 'Finished set up alerting for failed overnight jobs this week.'),
      ('sade.adeniyi@nexus.invalid|0|3', 'sade.adeniyi@nexus.invalid', 0, 'Replace the nightly CSV drop with a live feed', 'integration', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 6.80, 'Finished replace the nightly csv drop with a live feed this week.'),
      ('sade.adeniyi@nexus.invalid|1|0', 'sade.adeniyi@nexus.invalid', 1, 'Wait on Finance to licence the RPA platform', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 9.00, null, 'Still stuck on wait on finance to licence the rpa platform — waiting on Finance.'),
      ('sade.adeniyi@nexus.invalid|1|1', 'sade.adeniyi@nexus.invalid', 1, 'Hold the campaign flight until the Q4 budget is released', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 6.00, null, 'Still stuck on hold the campaign flight until the q4 budget is released — waiting on Finance.'),
      ('sade.adeniyi@nexus.invalid|1|2', 'sade.adeniyi@nexus.invalid', 1, 'Replace the nightly CSV drop with a live feed', 'integration', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 14.10, 'Finished replace the nightly csv drop with a live feed this week.'),
      ('sade.adeniyi@nexus.invalid|1|3', 'sade.adeniyi@nexus.invalid', 1, 'Automate the monthly reconciliation run', 'bots', 'high', 'delivered', false, 'none', null, true, null, 6.00, 5.30, 'Finished automate the monthly reconciliation run this week.'),
      ('sade.adeniyi@nexus.invalid|2|0', 'sade.adeniyi@nexus.invalid', 2, 'Wait on Finance to licence the RPA platform', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 7.00, null, 'Still stuck on wait on finance to licence the rpa platform — waiting on Finance.'),
      ('sade.adeniyi@nexus.invalid|2|1', 'sade.adeniyi@nexus.invalid', 2, 'Hold the campaign flight until the Q4 budget is released', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 11.00, null, 'Still stuck on hold the campaign flight until the q4 budget is released — waiting on Finance.'),
      ('sade.adeniyi@nexus.invalid|2|2', 'sade.adeniyi@nexus.invalid', 2, 'Cut the statement-matching job below five minutes', 'bots', 'high', 'delivered', false, 'none', null, true, null, 6.00, 6.70, 'Finished cut the statement-matching job below five minutes this week.'),
      ('sade.adeniyi@nexus.invalid|2|3', 'sade.adeniyi@nexus.invalid', 2, 'Move the scheduler onto the new deployment pipeline', 'platform', 'normal', 'dropped', true, 'none', null, true, null, 7.00, null, 'Planning to move the scheduler onto the new deployment pipeline.'),
      ('sade.adeniyi@nexus.invalid|3|0', 'sade.adeniyi@nexus.invalid', 3, 'Wait on Finance to licence the RPA platform', 'campaign', 'high', 'blocked', true, 'external_team', 'finance', true, null, 6.00, null, 'Still stuck on wait on finance to licence the rpa platform — waiting on Finance.'),
      ('sade.adeniyi@nexus.invalid|3|1', 'sade.adeniyi@nexus.invalid', 3, 'Hold the campaign flight until the Q4 budget is released', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 6.00, null, 'Still stuck on hold the campaign flight until the q4 budget is released — waiting on Finance.'),
      ('sade.adeniyi@nexus.invalid|3|2', 'sade.adeniyi@nexus.invalid', 3, 'Rotate the production service credentials', 'platform', 'high', 'deferred', false, 'none', null, true, null, 3.00, null, 'Planning to rotate the production service credentials.'),
      ('sade.adeniyi@nexus.invalid|3|3', 'sade.adeniyi@nexus.invalid', 3, 'Set up alerting for failed overnight jobs', 'platform', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 8.90, 'Finished set up alerting for failed overnight jobs this week.'),
      ('sade.adeniyi@nexus.invalid|4|0', 'sade.adeniyi@nexus.invalid', 4, 'Wait on Finance to licence the RPA platform', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 8.00, null, 'Still stuck on wait on finance to licence the rpa platform — waiting on Finance.'),
      ('sade.adeniyi@nexus.invalid|4|1', 'sade.adeniyi@nexus.invalid', 4, 'Hold the campaign flight until the Q4 budget is released', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 12.00, null, 'Still stuck on hold the campaign flight until the q4 budget is released — waiting on Finance.'),
      ('sade.adeniyi@nexus.invalid|4|2', 'sade.adeniyi@nexus.invalid', 4, 'Move the scheduler onto the new deployment pipeline', 'platform', 'normal', 'delivered', false, 'none', null, true, null, 14.00, 15.20, 'Finished move the scheduler onto the new deployment pipeline this week.'),
      ('sade.adeniyi@nexus.invalid|5|0', 'sade.adeniyi@nexus.invalid', 5, 'Wait on Finance to licence the RPA platform', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 5.00, null, 'Still stuck on wait on finance to licence the rpa platform — waiting on Finance.'),
      ('sade.adeniyi@nexus.invalid|5|1', 'sade.adeniyi@nexus.invalid', 5, 'Hold the campaign flight until the Q4 budget is released', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 13.00, null, 'Still stuck on hold the campaign flight until the q4 budget is released — waiting on Finance.'),
      ('sade.adeniyi@nexus.invalid|5|2', 'sade.adeniyi@nexus.invalid', 5, 'Set up alerting for failed overnight jobs', 'platform', 'critical', 'delivered', false, 'none', null, true, null, 8.00, 7.50, 'Finished set up alerting for failed overnight jobs this week.'),
      ('sade.adeniyi@nexus.invalid|5|3', 'sade.adeniyi@nexus.invalid', 5, 'Ship the invoice ingestion connector', 'integration', 'high', 'delivered', false, 'none', null, true, null, 4.00, 3.40, 'Finished ship the invoice ingestion connector this week.'),
      ('sade.adeniyi@nexus.invalid|5|4', 'sade.adeniyi@nexus.invalid', 5, 'Harden the inbound email parser against malformed attachments', 'integration', 'high', 'delivered', false, 'none', null, true, null, 5.00, 4.40, 'Finished harden the inbound email parser against malformed attachments this week.'),
      ('sade.adeniyi@nexus.invalid|6|0', 'sade.adeniyi@nexus.invalid', 6, 'Wait on Finance to licence the RPA platform', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 9.00, null, 'Still stuck on wait on finance to licence the rpa platform — waiting on Finance.'),
      ('sade.adeniyi@nexus.invalid|6|1', 'sade.adeniyi@nexus.invalid', 6, 'Hold the campaign flight until the Q4 budget is released', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 13.00, null, 'Still stuck on hold the campaign flight until the q4 budget is released — waiting on Finance.'),
      ('sade.adeniyi@nexus.invalid|6|2', 'sade.adeniyi@nexus.invalid', 6, 'Automate the monthly reconciliation run', 'bots', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 11.20, 'Finished automate the monthly reconciliation run this week.'),
      ('sade.adeniyi@nexus.invalid|7|0', 'sade.adeniyi@nexus.invalid', 7, 'Wait on Finance to licence the RPA platform', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 8.00, null, 'Still stuck on wait on finance to licence the rpa platform — waiting on Finance.'),
      ('sade.adeniyi@nexus.invalid|7|1', 'sade.adeniyi@nexus.invalid', 7, 'Hold the campaign flight until the Q4 budget is released', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 4.00, null, 'Still stuck on hold the campaign flight until the q4 budget is released — waiting on Finance.'),
      ('sade.adeniyi@nexus.invalid|7|2', 'sade.adeniyi@nexus.invalid', 7, 'Set up alerting for failed overnight jobs', 'platform', 'normal', 'deferred', false, 'none', null, true, null, 4.00, null, 'Planning to set up alerting for failed overnight jobs.'),
      ('sade.adeniyi@nexus.invalid|7|3', 'sade.adeniyi@nexus.invalid', 7, 'Add retry and backoff to the webhook dispatcher', 'integration', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.50, 'Finished add retry and backoff to the webhook dispatcher this week.'),
      ('rotimi.balogun@nexus.invalid|0|0', 'rotimi.balogun@nexus.invalid', 0, 'Replace the nightly CSV drop with a live feed', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 11.80, 'Finished replace the nightly csv drop with a live feed this week.'),
      ('rotimi.balogun@nexus.invalid|0|1', 'rotimi.balogun@nexus.invalid', 0, 'Move the scheduler onto the new deployment pipeline', 'backend', 'normal', 'partial', false, 'none', null, true, null, 6.00, 8.60, 'Planning to move the scheduler onto the new deployment pipeline.'),
      ('rotimi.balogun@nexus.invalid|0|2', 'rotimi.balogun@nexus.invalid', 0, 'Cut the statement-matching job below five minutes', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 12.70, 'Finished cut the statement-matching job below five minutes this week.'),
      ('rotimi.balogun@nexus.invalid|1|0', 'rotimi.balogun@nexus.invalid', 1, 'Ship the invoice ingestion connector', 'backend', 'normal', 'partial', false, 'none', null, true, null, 11.00, 15.80, 'Planning to ship the invoice ingestion connector.'),
      ('rotimi.balogun@nexus.invalid|1|1', 'rotimi.balogun@nexus.invalid', 1, 'Harden the inbound email parser against malformed attachments', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 14.50, 'Finished harden the inbound email parser against malformed attachments this week.'),
      ('rotimi.balogun@nexus.invalid|1|2', 'rotimi.balogun@nexus.invalid', 1, 'Set up alerting for failed overnight jobs', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 14.80, 'Finished set up alerting for failed overnight jobs this week.'),
      ('rotimi.balogun@nexus.invalid|2|0', 'rotimi.balogun@nexus.invalid', 2, 'Automate the monthly reconciliation run', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 7.00, 'Finished automate the monthly reconciliation run this week.'),
      ('rotimi.balogun@nexus.invalid|2|1', 'rotimi.balogun@nexus.invalid', 2, 'Rotate the production service credentials', 'backend', 'high', 'delivered', false, 'none', null, true, null, 11.00, 16.20, 'Finished rotate the production service credentials this week.'),
      ('rotimi.balogun@nexus.invalid|2|2', 'rotimi.balogun@nexus.invalid', 2, 'Cut the statement-matching job below five minutes', 'backend', 'high', 'delivered', false, 'none', null, true, null, 11.00, 15.30, 'Finished cut the statement-matching job below five minutes this week.'),
      ('rotimi.balogun@nexus.invalid|2|3', 'rotimi.balogun@nexus.invalid', 2, 'Harden the inbound email parser against malformed attachments', 'backend', 'normal', 'partial', false, 'none', null, true, null, 12.00, 16.00, 'Planning to harden the inbound email parser against malformed attachments.'),
      ('rotimi.balogun@nexus.invalid|3|0', 'rotimi.balogun@nexus.invalid', 3, 'Set up alerting for failed overnight jobs', 'backend', 'high', 'partial', false, 'none', null, true, null, 9.00, 13.10, 'Planning to set up alerting for failed overnight jobs.'),
      ('rotimi.balogun@nexus.invalid|3|1', 'rotimi.balogun@nexus.invalid', 3, 'Ship the invoice ingestion connector', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 13.70, 'Finished ship the invoice ingestion connector this week.'),
      ('rotimi.balogun@nexus.invalid|3|2', 'rotimi.balogun@nexus.invalid', 3, 'Cut the statement-matching job below five minutes', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 10.40, 'Finished cut the statement-matching job below five minutes this week.'),
      ('rotimi.balogun@nexus.invalid|3|3', 'rotimi.balogun@nexus.invalid', 3, 'Rotate the production service credentials', 'backend', 'critical', 'partial', false, 'none', null, true, null, 10.00, 15.00, 'Planning to rotate the production service credentials.'),
      ('rotimi.balogun@nexus.invalid|4|0', 'rotimi.balogun@nexus.invalid', 4, 'Automate the monthly reconciliation run', 'backend', 'normal', 'partial', false, 'none', null, true, null, 8.00, 12.00, 'Planning to automate the monthly reconciliation run.'),
      ('rotimi.balogun@nexus.invalid|4|1', 'rotimi.balogun@nexus.invalid', 4, 'Harden the inbound email parser against malformed attachments', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 15.90, 'Finished harden the inbound email parser against malformed attachments this week.'),
      ('rotimi.balogun@nexus.invalid|4|2', 'rotimi.balogun@nexus.invalid', 4, 'Cut the statement-matching job below five minutes', 'backend', 'critical', 'delivered', false, 'none', null, true, null, 7.00, 10.50, 'Finished cut the statement-matching job below five minutes this week.'),
      ('rotimi.balogun@nexus.invalid|4|3', 'rotimi.balogun@nexus.invalid', 4, 'Wire payroll exports into the data warehouse', 'backend', 'high', 'delivered', false, 'none', null, true, null, 4.00, 5.50, 'Finished wire payroll exports into the data warehouse this week.'),
      ('rotimi.balogun@nexus.invalid|5|0', 'rotimi.balogun@nexus.invalid', 5, 'Automate the monthly reconciliation run', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 11.10, 'Finished automate the monthly reconciliation run this week.'),
      ('rotimi.balogun@nexus.invalid|5|1', 'rotimi.balogun@nexus.invalid', 5, 'Add retry and backoff to the webhook dispatcher', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 12.90, 'Finished add retry and backoff to the webhook dispatcher this week.'),
      ('rotimi.balogun@nexus.invalid|5|2', 'rotimi.balogun@nexus.invalid', 5, 'Set up alerting for failed overnight jobs', 'backend', 'high', 'partial', false, 'none', null, true, null, 5.00, 7.40, 'Planning to set up alerting for failed overnight jobs.'),
      ('rotimi.balogun@nexus.invalid|5|3', 'rotimi.balogun@nexus.invalid', 5, 'Ship the invoice ingestion connector', 'backend', 'critical', 'partial', false, 'none', null, true, null, 6.00, 8.40, 'Planning to ship the invoice ingestion connector.'),
      ('rotimi.balogun@nexus.invalid|6|0', 'rotimi.balogun@nexus.invalid', 6, 'Rotate the production service credentials', 'backend', 'high', 'delivered', false, 'none', null, true, null, 11.00, 16.10, 'Finished rotate the production service credentials this week.'),
      ('rotimi.balogun@nexus.invalid|6|1', 'rotimi.balogun@nexus.invalid', 6, 'Harden the inbound email parser against malformed attachments', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 16.50, 'Finished harden the inbound email parser against malformed attachments this week.'),
      ('rotimi.balogun@nexus.invalid|6|2', 'rotimi.balogun@nexus.invalid', 6, 'Ship the invoice ingestion connector', 'backend', 'critical', 'delivered', false, 'none', null, true, null, 9.00, 13.20, 'Finished ship the invoice ingestion connector this week.'),
      ('rotimi.balogun@nexus.invalid|6|3', 'rotimi.balogun@nexus.invalid', 6, 'Add retry and backoff to the webhook dispatcher', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 5.50, 'Finished add retry and backoff to the webhook dispatcher this week.'),
      ('rotimi.balogun@nexus.invalid|6|4', 'rotimi.balogun@nexus.invalid', 6, 'Automate the monthly reconciliation run', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 13.60, 'Finished automate the monthly reconciliation run this week.'),
      ('rotimi.balogun@nexus.invalid|7|0', 'rotimi.balogun@nexus.invalid', 7, 'Harden the inbound email parser against malformed attachments', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 9.80, 'Finished harden the inbound email parser against malformed attachments this week.'),
      ('rotimi.balogun@nexus.invalid|7|1', 'rotimi.balogun@nexus.invalid', 7, 'Wire payroll exports into the data warehouse', 'backend', 'normal', 'partial', false, 'none', null, true, null, 8.00, 11.90, 'Planning to wire payroll exports into the data warehouse.'),
      ('rotimi.balogun@nexus.invalid|7|2', 'rotimi.balogun@nexus.invalid', 7, 'Ship the invoice ingestion connector', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 12.20, 'Finished ship the invoice ingestion connector this week.'),
      ('rotimi.balogun@nexus.invalid|7|3', 'rotimi.balogun@nexus.invalid', 7, 'Cut the statement-matching job below five minutes', 'backend', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 7.30, 'Finished cut the statement-matching job below five minutes this week.'),
      ('rotimi.balogun@nexus.invalid|7|4', 'rotimi.balogun@nexus.invalid', 7, 'Add retry and backoff to the webhook dispatcher', 'backend', 'high', 'delivered', false, 'none', null, true, null, 8.00, 10.80, 'Finished add retry and backoff to the webhook dispatcher this week.'),
      ('chinaza.mbah@nexus.invalid|0|0', 'chinaza.mbah@nexus.invalid', 0, 'Wait on HR to sign off the employee data handling policy', 'bots', 'normal', 'blocked', true, 'external_team', 'people', true, null, 9.00, null, 'Still stuck on wait on hr to sign off the employee data handling policy — waiting on HR.'),
      ('chinaza.mbah@nexus.invalid|0|1', 'chinaza.mbah@nexus.invalid', 0, 'Hold the onboarding bot until the data policy lands', 'bots', 'normal', 'blocked', true, 'external_team', 'people', true, null, 6.00, null, 'Still stuck on hold the onboarding bot until the data policy lands — waiting on HR.'),
      ('chinaza.mbah@nexus.invalid|0|2', 'chinaza.mbah@nexus.invalid', 0, 'Wire payroll exports into the data warehouse', 'integration', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 6.60, 'Finished wire payroll exports into the data warehouse this week.'),
      ('chinaza.mbah@nexus.invalid|0|3', 'chinaza.mbah@nexus.invalid', 0, 'Ship the invoice ingestion connector', 'integration', 'normal', 'in_progress', true, 'none', null, true, null, 4.00, null, 'Planning to ship the invoice ingestion connector.'),
      ('chinaza.mbah@nexus.invalid|0|4', 'chinaza.mbah@nexus.invalid', 0, 'Automate the monthly reconciliation run', 'bots', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 4.70, 'Finished automate the monthly reconciliation run this week.'),
      ('chinaza.mbah@nexus.invalid|1|0', 'chinaza.mbah@nexus.invalid', 1, 'Wait on HR to sign off the employee data handling policy', 'bots', 'high', 'blocked', true, 'external_team', 'people', true, null, 4.00, null, 'Still stuck on wait on hr to sign off the employee data handling policy — waiting on HR.'),
      ('chinaza.mbah@nexus.invalid|1|1', 'chinaza.mbah@nexus.invalid', 1, 'Hold the onboarding bot until the data policy lands', 'bots', 'high', 'blocked', true, 'external_team', 'people', true, null, 12.00, null, 'Still stuck on hold the onboarding bot until the data policy lands — waiting on HR.'),
      ('chinaza.mbah@nexus.invalid|1|2', 'chinaza.mbah@nexus.invalid', 1, 'Add retry and backoff to the webhook dispatcher', 'integration', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 7.00, 'Finished add retry and backoff to the webhook dispatcher this week.'),
      ('chinaza.mbah@nexus.invalid|1|3', 'chinaza.mbah@nexus.invalid', 1, 'Rotate the production service credentials', 'platform', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 4.50, 'Finished rotate the production service credentials this week.'),
      ('chinaza.mbah@nexus.invalid|2|0', 'chinaza.mbah@nexus.invalid', 2, 'Wait on HR to sign off the employee data handling policy', 'bots', 'normal', 'blocked', true, 'external_team', 'people', true, null, 14.00, null, 'Still stuck on wait on hr to sign off the employee data handling policy — waiting on HR.'),
      ('chinaza.mbah@nexus.invalid|2|1', 'chinaza.mbah@nexus.invalid', 2, 'Hold the onboarding bot until the data policy lands', 'bots', 'high', 'blocked', true, 'external_team', 'people', true, null, 7.00, null, 'Still stuck on hold the onboarding bot until the data policy lands — waiting on HR.'),
      ('chinaza.mbah@nexus.invalid|2|2', 'chinaza.mbah@nexus.invalid', 2, 'Replace the nightly CSV drop with a live feed', 'integration', 'normal', 'in_progress', false, 'none', null, true, null, 4.00, null, 'Planning to replace the nightly csv drop with a live feed.'),
      ('chinaza.mbah@nexus.invalid|2|3', 'chinaza.mbah@nexus.invalid', 2, 'Harden the inbound email parser against malformed attachments', 'integration', 'normal', 'deferred', false, 'none', null, true, null, 13.00, null, 'Planning to harden the inbound email parser against malformed attachments.'),
      ('chinaza.mbah@nexus.invalid|2|4', 'chinaza.mbah@nexus.invalid', 2, 'Set up alerting for failed overnight jobs', 'platform', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 11.40, 'Finished set up alerting for failed overnight jobs this week.'),
      ('chinaza.mbah@nexus.invalid|3|0', 'chinaza.mbah@nexus.invalid', 3, 'Wait on HR to sign off the employee data handling policy', 'bots', 'normal', 'blocked', true, 'external_team', 'people', true, null, 3.00, null, 'Still stuck on wait on hr to sign off the employee data handling policy — waiting on HR.'),
      ('chinaza.mbah@nexus.invalid|3|1', 'chinaza.mbah@nexus.invalid', 3, 'Hold the onboarding bot until the data policy lands', 'bots', 'critical', 'blocked', true, 'external_team', 'people', true, null, 9.00, null, 'Still stuck on hold the onboarding bot until the data policy lands — waiting on HR.'),
      ('chinaza.mbah@nexus.invalid|3|2', 'chinaza.mbah@nexus.invalid', 3, 'Replace the nightly CSV drop with a live feed', 'integration', 'critical', 'delivered', false, 'none', null, true, null, 13.00, 14.70, 'Finished replace the nightly csv drop with a live feed this week.'),
      ('chinaza.mbah@nexus.invalid|4|0', 'chinaza.mbah@nexus.invalid', 4, 'Wait on HR to sign off the employee data handling policy', 'bots', 'critical', 'blocked', true, 'external_team', 'people', true, null, 14.00, null, 'Still stuck on wait on hr to sign off the employee data handling policy — waiting on HR.'),
      ('chinaza.mbah@nexus.invalid|4|1', 'chinaza.mbah@nexus.invalid', 4, 'Hold the onboarding bot until the data policy lands', 'bots', 'high', 'blocked', true, 'external_team', 'people', true, null, 11.00, null, 'Still stuck on hold the onboarding bot until the data policy lands — waiting on HR.'),
      ('chinaza.mbah@nexus.invalid|4|2', 'chinaza.mbah@nexus.invalid', 4, 'Automate the monthly reconciliation run', 'bots', 'normal', 'partial', true, 'none', null, true, null, 9.00, 8.90, 'Planning to automate the monthly reconciliation run.'),
      ('chinaza.mbah@nexus.invalid|4|3', 'chinaza.mbah@nexus.invalid', 4, 'Replace the nightly CSV drop with a live feed', 'integration', 'critical', 'delivered', false, 'none', null, true, null, 6.00, 5.70, 'Finished replace the nightly csv drop with a live feed this week.'),
      ('chinaza.mbah@nexus.invalid|5|0', 'chinaza.mbah@nexus.invalid', 5, 'Wait on HR to sign off the employee data handling policy', 'bots', 'normal', 'blocked', true, 'external_team', 'people', true, null, 13.00, null, 'Still stuck on wait on hr to sign off the employee data handling policy — waiting on HR.'),
      ('chinaza.mbah@nexus.invalid|5|1', 'chinaza.mbah@nexus.invalid', 5, 'Hold the onboarding bot until the data policy lands', 'bots', 'high', 'blocked', true, 'external_team', 'people', true, null, 5.00, null, 'Still stuck on hold the onboarding bot until the data policy lands — waiting on HR.'),
      ('chinaza.mbah@nexus.invalid|5|2', 'chinaza.mbah@nexus.invalid', 5, 'Wire payroll exports into the data warehouse', 'integration', 'normal', 'deferred', false, 'none', null, true, null, 12.00, null, 'Planning to wire payroll exports into the data warehouse.'),
      ('chinaza.mbah@nexus.invalid|5|3', 'chinaza.mbah@nexus.invalid', 5, 'Cut the statement-matching job below five minutes', 'bots', 'high', 'deferred', false, 'none', null, true, null, 8.00, null, 'Planning to cut the statement-matching job below five minutes.'),
      ('chinaza.mbah@nexus.invalid|6|0', 'chinaza.mbah@nexus.invalid', 6, 'Wait on HR to sign off the employee data handling policy', 'bots', 'critical', 'blocked', true, 'external_team', 'people', true, null, 13.00, null, 'Still stuck on wait on hr to sign off the employee data handling policy — waiting on HR.'),
      ('chinaza.mbah@nexus.invalid|6|1', 'chinaza.mbah@nexus.invalid', 6, 'Hold the onboarding bot until the data policy lands', 'bots', 'high', 'blocked', true, 'external_team', 'people', true, null, 10.00, null, 'Still stuck on hold the onboarding bot until the data policy lands — waiting on HR.'),
      ('chinaza.mbah@nexus.invalid|6|2', 'chinaza.mbah@nexus.invalid', 6, 'Wire payroll exports into the data warehouse', 'integration', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 11.30, 'Finished wire payroll exports into the data warehouse this week.'),
      ('chinaza.mbah@nexus.invalid|6|3', 'chinaza.mbah@nexus.invalid', 6, 'Ship the invoice ingestion connector', 'integration', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 6.80, 'Finished ship the invoice ingestion connector this week.'),
      ('chinaza.mbah@nexus.invalid|6|4', 'chinaza.mbah@nexus.invalid', 6, 'Cut the statement-matching job below five minutes', 'bots', 'high', 'dropped', false, 'none', null, true, null, 11.00, null, 'Planning to cut the statement-matching job below five minutes.'),
      ('chinaza.mbah@nexus.invalid|7|0', 'chinaza.mbah@nexus.invalid', 7, 'Wait on HR to sign off the employee data handling policy', 'bots', 'normal', 'blocked', true, 'external_team', 'people', true, null, 9.00, null, 'Still stuck on wait on hr to sign off the employee data handling policy — waiting on HR.'),
      ('chinaza.mbah@nexus.invalid|7|1', 'chinaza.mbah@nexus.invalid', 7, 'Hold the onboarding bot until the data policy lands', 'bots', 'normal', 'blocked', true, 'external_team', 'people', true, null, 4.00, null, 'Still stuck on hold the onboarding bot until the data policy lands — waiting on HR.'),
      ('chinaza.mbah@nexus.invalid|7|2', 'chinaza.mbah@nexus.invalid', 7, 'Rotate the production service credentials', 'platform', 'high', 'delivered', false, 'none', null, true, null, 5.00, 5.40, 'Finished rotate the production service credentials this week.'),
      ('olusola.ajayi@nexus.invalid|0|0', 'olusola.ajayi@nexus.invalid', 0, 'Settle the outstanding vendor invoices', 'procurement', 'normal', 'dropped', false, 'none', null, true, null, 10.00, null, 'Planning to settle the outstanding vendor invoices.'),
      ('olusola.ajayi@nexus.invalid|0|1', 'olusola.ajayi@nexus.invalid', 0, 'Rebuild the cash-flow forecast model', 'control', 'normal', 'delivered', false, 'none', null, true, null, 14.00, 12.00, 'Finished rebuild the cash-flow forecast model this week.'),
      ('olusola.ajayi@nexus.invalid|0|2', 'olusola.ajayi@nexus.invalid', 0, 'Finish the quarterly VAT return', 'control', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 6.00, 'Finished finish the quarterly vat return this week.'),
      ('olusola.ajayi@nexus.invalid|0|3', 'olusola.ajayi@nexus.invalid', 0, 'Approve the RPA licence renewal', 'procurement', 'normal', 'dropped', false, 'none', null, true, null, 13.00, null, 'Planning to approve the rpa licence renewal.'),
      ('olusola.ajayi@nexus.invalid|0|4', 'olusola.ajayi@nexus.invalid', 0, 'Close the September management accounts', 'control', 'critical', 'delivered', false, 'none', null, true, null, 6.00, 6.40, 'Finished close the september management accounts this week.'),
      ('olusola.ajayi@nexus.invalid|1|0', 'olusola.ajayi@nexus.invalid', 1, 'Finish the quarterly VAT return', 'control', 'critical', 'dropped', false, 'none', null, true, null, 5.00, null, 'Planning to finish the quarterly vat return.'),
      ('olusola.ajayi@nexus.invalid|1|1', 'olusola.ajayi@nexus.invalid', 1, 'Release the Q4 campaign budget', 'procurement', 'normal', 'in_progress', false, 'none', null, true, null, 12.00, null, 'Planning to release the q4 campaign budget.'),
      ('olusola.ajayi@nexus.invalid|1|2', 'olusola.ajayi@nexus.invalid', 1, 'Renegotiate the payment terms with the two largest suppliers', 'procurement', 'high', 'delivered', false, 'none', null, true, null, 10.00, 10.20, 'Finished renegotiate the payment terms with the two largest suppliers this week.'),
      ('olusola.ajayi@nexus.invalid|1|3', 'olusola.ajayi@nexus.invalid', 1, 'Close the September management accounts', 'control', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 6.50, 'Finished close the september management accounts this week.'),
      ('olusola.ajayi@nexus.invalid|1|4', 'olusola.ajayi@nexus.invalid', 1, 'Reconcile the supplier statements for Q3', 'control', 'normal', 'partial', false, 'none', null, true, null, 8.00, 8.90, 'Planning to reconcile the supplier statements for q3.'),
      ('olusola.ajayi@nexus.invalid|2|0', 'olusola.ajayi@nexus.invalid', 2, 'Rebuild the cash-flow forecast model', 'control', 'normal', 'dropped', false, 'none', null, true, null, 11.00, null, 'Planning to rebuild the cash-flow forecast model.'),
      ('olusola.ajayi@nexus.invalid|2|1', 'olusola.ajayi@nexus.invalid', 2, 'Renegotiate the payment terms with the two largest suppliers', 'procurement', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 11.10, 'Finished renegotiate the payment terms with the two largest suppliers this week.'),
      ('olusola.ajayi@nexus.invalid|2|2', 'olusola.ajayi@nexus.invalid', 2, 'Settle the outstanding vendor invoices', 'procurement', 'normal', 'in_progress', true, 'none', null, true, null, 11.00, null, 'Planning to settle the outstanding vendor invoices.'),
      ('olusola.ajayi@nexus.invalid|2|3', 'olusola.ajayi@nexus.invalid', 2, 'Reconcile the supplier statements for Q3', 'control', 'high', 'delivered', false, 'none', null, true, null, 5.00, 5.30, 'Finished reconcile the supplier statements for q3 this week.'),
      ('olusola.ajayi@nexus.invalid|2|4', 'olusola.ajayi@nexus.invalid', 2, 'Release the Q4 campaign budget', 'procurement', 'high', 'delivered', false, 'none', null, true, null, 7.00, 7.00, 'Finished release the q4 campaign budget this week.'),
      ('olusola.ajayi@nexus.invalid|3|0', 'olusola.ajayi@nexus.invalid', 3, 'Settle the outstanding vendor invoices', 'procurement', 'normal', 'dropped', false, 'none', null, true, null, 8.00, null, 'Planning to settle the outstanding vendor invoices.'),
      ('olusola.ajayi@nexus.invalid|3|1', 'olusola.ajayi@nexus.invalid', 3, 'Finish the quarterly VAT return', 'control', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 12.00, 'Finished finish the quarterly vat return this week.'),
      ('olusola.ajayi@nexus.invalid|3|2', 'olusola.ajayi@nexus.invalid', 3, 'Release the Q4 campaign budget', 'procurement', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 3.90, 'Finished release the q4 campaign budget this week.'),
      ('olusola.ajayi@nexus.invalid|3|3', 'olusola.ajayi@nexus.invalid', 3, 'Rebuild the cash-flow forecast model', 'control', 'normal', 'deferred', false, 'none', null, true, null, 4.00, null, 'Planning to rebuild the cash-flow forecast model.'),
      ('olusola.ajayi@nexus.invalid|4|0', 'olusola.ajayi@nexus.invalid', 4, 'Close the September management accounts', 'control', 'normal', 'dropped', false, 'none', null, true, null, 11.00, null, 'Planning to close the september management accounts.'),
      ('olusola.ajayi@nexus.invalid|4|1', 'olusola.ajayi@nexus.invalid', 4, 'Approve the RPA licence renewal', 'procurement', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 8.80, 'Finished approve the rpa licence renewal this week.'),
      ('olusola.ajayi@nexus.invalid|4|2', 'olusola.ajayi@nexus.invalid', 4, 'Release the Q4 campaign budget', 'procurement', 'critical', 'delivered', false, 'none', null, true, null, 6.00, 5.80, 'Finished release the q4 campaign budget this week.'),
      ('olusola.ajayi@nexus.invalid|4|3', 'olusola.ajayi@nexus.invalid', 4, 'Finish the quarterly VAT return', 'control', 'high', 'partial', true, 'none', null, true, null, 10.00, 9.30, 'Planning to finish the quarterly vat return.'),
      ('olusola.ajayi@nexus.invalid|5|0', 'olusola.ajayi@nexus.invalid', 5, 'Release the Q4 campaign budget', 'procurement', 'normal', 'dropped', false, 'none', null, true, null, 5.00, null, 'Planning to release the q4 campaign budget.'),
      ('olusola.ajayi@nexus.invalid|5|1', 'olusola.ajayi@nexus.invalid', 5, 'Settle the outstanding vendor invoices', 'procurement', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 11.70, 'Finished settle the outstanding vendor invoices this week.'),
      ('olusola.ajayi@nexus.invalid|5|2', 'olusola.ajayi@nexus.invalid', 5, 'Approve the RPA licence renewal', 'procurement', 'normal', 'delivered', false, 'none', null, true, null, 3.00, 3.30, 'Finished approve the rpa licence renewal this week.'),
      ('olusola.ajayi@nexus.invalid|5|3', 'olusola.ajayi@nexus.invalid', 5, 'Rebuild the cash-flow forecast model', 'control', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 11.20, 'Finished rebuild the cash-flow forecast model this week.'),
      ('olusola.ajayi@nexus.invalid|5|4', 'olusola.ajayi@nexus.invalid', 5, 'Reconcile the supplier statements for Q3', 'control', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 3.50, 'Finished reconcile the supplier statements for q3 this week.'),
      ('olusola.ajayi@nexus.invalid|6|0', 'olusola.ajayi@nexus.invalid', 6, 'Release the Q4 campaign budget', 'procurement', 'normal', 'dropped', false, 'none', null, true, null, 9.00, null, 'Planning to release the q4 campaign budget.'),
      ('olusola.ajayi@nexus.invalid|6|1', 'olusola.ajayi@nexus.invalid', 6, 'Finish the quarterly VAT return', 'control', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 11.10, 'Finished finish the quarterly vat return this week.'),
      ('olusola.ajayi@nexus.invalid|6|2', 'olusola.ajayi@nexus.invalid', 6, 'Approve the RPA licence renewal', 'procurement', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 11.50, 'Finished approve the rpa licence renewal this week.'),
      ('olusola.ajayi@nexus.invalid|6|3', 'olusola.ajayi@nexus.invalid', 6, 'Rebuild the cash-flow forecast model', 'control', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.40, 'Finished rebuild the cash-flow forecast model this week.'),
      ('olusola.ajayi@nexus.invalid|7|0', 'olusola.ajayi@nexus.invalid', 7, 'Renegotiate the payment terms with the two largest suppliers', 'procurement', 'critical', 'dropped', false, 'none', null, true, null, 3.00, null, 'Planning to renegotiate the payment terms with the two largest suppliers.'),
      ('olusola.ajayi@nexus.invalid|7|1', 'olusola.ajayi@nexus.invalid', 7, 'Rebuild the cash-flow forecast model', 'control', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 3.80, 'Finished rebuild the cash-flow forecast model this week.'),
      ('olusola.ajayi@nexus.invalid|7|2', 'olusola.ajayi@nexus.invalid', 7, 'Release the Q4 campaign budget', 'procurement', 'normal', 'deferred', false, 'none', null, true, null, 8.00, null, 'Planning to release the q4 campaign budget.'),
      ('olusola.ajayi@nexus.invalid|7|3', 'olusola.ajayi@nexus.invalid', 7, 'Reconcile the supplier statements for Q3', 'control', 'normal', 'deferred', true, 'none', null, true, null, 4.00, null, 'Planning to reconcile the supplier statements for q3.'),
      ('grace.etim@nexus.invalid|0|0', 'grace.etim@nexus.invalid', 0, 'Approve the RPA licence renewal', 'procurement', 'critical', 'delivered', false, 'none', null, true, null, 7.00, 6.90, 'Finished approve the rpa licence renewal this week.'),
      ('grace.etim@nexus.invalid|0|1', 'grace.etim@nexus.invalid', 0, 'Reconcile the supplier statements for Q3', 'control', 'normal', 'partial', false, 'none', null, true, null, 12.00, 12.40, 'Planning to reconcile the supplier statements for q3.'),
      ('grace.etim@nexus.invalid|0|2', 'grace.etim@nexus.invalid', 0, 'Release the Q4 campaign budget', 'procurement', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 10.30, 'Finished release the q4 campaign budget this week.'),
      ('grace.etim@nexus.invalid|0|3', 'grace.etim@nexus.invalid', 0, 'Rebuild the cash-flow forecast model', 'control', 'normal', 'in_progress', false, 'none', null, true, null, 6.00, null, 'Planning to rebuild the cash-flow forecast model.'),
      ('grace.etim@nexus.invalid|0|4', 'grace.etim@nexus.invalid', 0, 'Renegotiate the payment terms with the two largest suppliers', 'procurement', 'normal', 'delivered', false, 'none', null, true, null, 14.00, 16.10, 'Finished renegotiate the payment terms with the two largest suppliers this week.'),
      ('grace.etim@nexus.invalid|1|0', 'grace.etim@nexus.invalid', 1, 'Renegotiate the payment terms with the two largest suppliers', 'procurement', 'normal', 'partial', true, 'none', null, true, null, 14.00, 15.60, 'Planning to renegotiate the payment terms with the two largest suppliers.'),
      ('grace.etim@nexus.invalid|1|1', 'grace.etim@nexus.invalid', 1, 'Approve the RPA licence renewal', 'procurement', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.60, 'Finished approve the rpa licence renewal this week.'),
      ('grace.etim@nexus.invalid|1|2', 'grace.etim@nexus.invalid', 1, 'Rebuild the cash-flow forecast model', 'control', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 13.10, 'Finished rebuild the cash-flow forecast model this week.'),
      ('grace.etim@nexus.invalid|1|3', 'grace.etim@nexus.invalid', 1, 'Release the Q4 campaign budget', 'procurement', 'critical', 'deferred', false, 'none', null, true, null, 12.00, null, 'Planning to release the q4 campaign budget.'),
      ('grace.etim@nexus.invalid|2|0', 'grace.etim@nexus.invalid', 2, 'Close the September management accounts', 'control', 'normal', 'dropped', false, 'none', null, true, null, 13.00, null, 'Planning to close the september management accounts.'),
      ('grace.etim@nexus.invalid|2|1', 'grace.etim@nexus.invalid', 2, 'Rebuild the cash-flow forecast model', 'control', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 8.10, 'Finished rebuild the cash-flow forecast model this week.'),
      ('grace.etim@nexus.invalid|2|2', 'grace.etim@nexus.invalid', 2, 'Approve the RPA licence renewal', 'procurement', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 9.80, 'Finished approve the rpa licence renewal this week.'),
      ('grace.etim@nexus.invalid|2|3', 'grace.etim@nexus.invalid', 2, 'Renegotiate the payment terms with the two largest suppliers', 'procurement', 'normal', 'partial', false, 'none', null, true, null, 5.00, 5.60, 'Planning to renegotiate the payment terms with the two largest suppliers.'),
      ('grace.etim@nexus.invalid|3|0', 'grace.etim@nexus.invalid', 3, 'Renegotiate the payment terms with the two largest suppliers', 'procurement', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 6.50, 'Finished renegotiate the payment terms with the two largest suppliers this week.'),
      ('grace.etim@nexus.invalid|3|1', 'grace.etim@nexus.invalid', 3, 'Settle the outstanding vendor invoices', 'procurement', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 8.90, 'Finished settle the outstanding vendor invoices this week.'),
      ('grace.etim@nexus.invalid|3|2', 'grace.etim@nexus.invalid', 3, 'Finish the quarterly VAT return', 'control', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 13.00, 'Finished finish the quarterly vat return this week.'),
      ('grace.etim@nexus.invalid|3|3', 'grace.etim@nexus.invalid', 3, 'Rebuild the cash-flow forecast model', 'control', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 10.10, 'Finished rebuild the cash-flow forecast model this week.'),
      ('grace.etim@nexus.invalid|4|0', 'grace.etim@nexus.invalid', 4, 'Settle the outstanding vendor invoices', 'procurement', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 8.40, 'Finished settle the outstanding vendor invoices this week.'),
      ('grace.etim@nexus.invalid|4|1', 'grace.etim@nexus.invalid', 4, 'Finish the quarterly VAT return', 'control', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 4.80, 'Finished finish the quarterly vat return this week.'),
      ('grace.etim@nexus.invalid|4|2', 'grace.etim@nexus.invalid', 4, 'Close the September management accounts', 'control', 'high', 'partial', true, 'none', null, true, null, 14.00, 15.80, 'Planning to close the september management accounts.'),
      ('grace.etim@nexus.invalid|5|0', 'grace.etim@nexus.invalid', 5, 'Close the September management accounts', 'control', 'normal', 'deferred', true, 'none', null, true, null, 4.00, null, 'Planning to close the september management accounts.'),
      ('grace.etim@nexus.invalid|5|1', 'grace.etim@nexus.invalid', 5, 'Release the Q4 campaign budget', 'procurement', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 4.50, 'Finished release the q4 campaign budget this week.'),
      ('grace.etim@nexus.invalid|5|2', 'grace.etim@nexus.invalid', 5, 'Finish the quarterly VAT return', 'control', 'high', 'deferred', false, 'none', null, true, null, 6.00, null, 'Planning to finish the quarterly vat return.'),
      ('grace.etim@nexus.invalid|6|0', 'grace.etim@nexus.invalid', 6, 'Rebuild the cash-flow forecast model', 'control', 'normal', 'deferred', true, 'none', null, true, null, 12.00, null, 'Planning to rebuild the cash-flow forecast model.'),
      ('grace.etim@nexus.invalid|6|1', 'grace.etim@nexus.invalid', 6, 'Renegotiate the payment terms with the two largest suppliers', 'procurement', 'high', 'delivered', false, 'none', null, true, null, 5.00, 5.40, 'Finished renegotiate the payment terms with the two largest suppliers this week.'),
      ('grace.etim@nexus.invalid|6|2', 'grace.etim@nexus.invalid', 6, 'Reconcile the supplier statements for Q3', 'control', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 8.40, 'Finished reconcile the supplier statements for q3 this week.'),
      ('grace.etim@nexus.invalid|6|3', 'grace.etim@nexus.invalid', 6, 'Settle the outstanding vendor invoices', 'procurement', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 9.00, 'Finished settle the outstanding vendor invoices this week.'),
      ('grace.etim@nexus.invalid|7|0', 'grace.etim@nexus.invalid', 7, 'Close the September management accounts', 'control', 'normal', 'deferred', false, 'none', null, true, null, 10.00, null, 'Planning to close the september management accounts.'),
      ('grace.etim@nexus.invalid|7|1', 'grace.etim@nexus.invalid', 7, 'Finish the quarterly VAT return', 'control', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 10.20, 'Finished finish the quarterly vat return this week.'),
      ('grace.etim@nexus.invalid|7|2', 'grace.etim@nexus.invalid', 7, 'Rebuild the cash-flow forecast model', 'control', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 9.10, 'Finished rebuild the cash-flow forecast model this week.'),
      ('grace.etim@nexus.invalid|7|3', 'grace.etim@nexus.invalid', 7, 'Approve the RPA licence renewal', 'procurement', 'high', 'delivered', false, 'none', null, true, null, 10.00, 9.00, 'Finished approve the rpa licence renewal this week.'),
      ('temitope.oladele@nexus.invalid|0|0', 'temitope.oladele@nexus.invalid', 0, 'Produce the product launch explainer', 'content', 'high', 'dropped', false, 'none', null, true, null, 7.00, null, 'Planning to produce the product launch explainer.'),
      ('temitope.oladele@nexus.invalid|0|1', 'temitope.oladele@nexus.invalid', 0, 'Ship the campaign landing page', 'campaign', 'normal', 'deferred', false, 'none', null, true, null, 5.00, null, 'Planning to ship the campaign landing page.'),
      ('temitope.oladele@nexus.invalid|0|2', 'temitope.oladele@nexus.invalid', 0, 'Rewrite the onboarding email sequence', 'content', 'normal', 'partial', true, 'none', null, true, null, 11.00, 9.90, 'Planning to rewrite the onboarding email sequence.'),
      ('temitope.oladele@nexus.invalid|0|3', 'temitope.oladele@nexus.invalid', 0, 'Book the paid media flight for October', 'campaign', 'normal', 'deferred', true, 'none', null, true, null, 8.00, null, 'Planning to book the paid media flight for october.'),
      ('temitope.oladele@nexus.invalid|1|0', 'temitope.oladele@nexus.invalid', 1, 'Produce the product launch explainer', 'content', 'normal', 'partial', false, 'none', null, true, null, 12.00, 11.90, 'Planning to produce the product launch explainer.'),
      ('temitope.oladele@nexus.invalid|1|1', 'temitope.oladele@nexus.invalid', 1, 'Publish the October editorial calendar', 'content', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 9.80, 'Finished publish the october editorial calendar this week.'),
      ('temitope.oladele@nexus.invalid|1|2', 'temitope.oladele@nexus.invalid', 1, 'Launch the Q4 demand campaign', 'campaign', 'normal', 'partial', false, 'none', null, true, null, 4.00, 3.90, 'Planning to launch the q4 demand campaign.'),
      ('temitope.oladele@nexus.invalid|1|3', 'temitope.oladele@nexus.invalid', 1, 'Run the customer story interviews', 'campaign', 'critical', 'partial', false, 'none', null, true, null, 5.00, 4.80, 'Planning to run the customer story interviews.'),
      ('temitope.oladele@nexus.invalid|2|0', 'temitope.oladele@nexus.invalid', 2, 'Run the customer story interviews', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 9.60, 'Finished run the customer story interviews this week.'),
      ('temitope.oladele@nexus.invalid|2|1', 'temitope.oladele@nexus.invalid', 2, 'Book the paid media flight for October', 'campaign', 'normal', 'deferred', false, 'none', null, true, null, 13.00, null, 'Planning to book the paid media flight for october.'),
      ('temitope.oladele@nexus.invalid|2|2', 'temitope.oladele@nexus.invalid', 2, 'Ship the campaign landing page', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 4.40, 'Finished ship the campaign landing page this week.'),
      ('temitope.oladele@nexus.invalid|2|3', 'temitope.oladele@nexus.invalid', 2, 'Rewrite the onboarding email sequence', 'content', 'high', 'partial', true, 'none', null, true, null, 12.00, 11.60, 'Planning to rewrite the onboarding email sequence.'),
      ('temitope.oladele@nexus.invalid|3|0', 'temitope.oladele@nexus.invalid', 3, 'Book the paid media flight for October', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 11.10, 'Finished book the paid media flight for october this week.'),
      ('temitope.oladele@nexus.invalid|3|1', 'temitope.oladele@nexus.invalid', 3, 'Produce the product launch explainer', 'content', 'normal', 'in_progress', true, 'none', null, true, null, 3.00, null, 'Planning to produce the product launch explainer.'),
      ('temitope.oladele@nexus.invalid|3|2', 'temitope.oladele@nexus.invalid', 3, 'Publish the October editorial calendar', 'content', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 12.00, 'Finished publish the october editorial calendar this week.'),
      ('temitope.oladele@nexus.invalid|3|3', 'temitope.oladele@nexus.invalid', 3, 'Ship the campaign landing page', 'campaign', 'normal', 'in_progress', false, 'none', null, true, null, 10.00, null, 'Planning to ship the campaign landing page.'),
      ('temitope.oladele@nexus.invalid|3|4', 'temitope.oladele@nexus.invalid', 3, 'Rewrite the onboarding email sequence', 'content', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 7.90, 'Finished rewrite the onboarding email sequence this week.'),
      ('temitope.oladele@nexus.invalid|4|0', 'temitope.oladele@nexus.invalid', 4, 'Produce the product launch explainer', 'content', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 6.10, 'Finished produce the product launch explainer this week.'),
      ('temitope.oladele@nexus.invalid|4|1', 'temitope.oladele@nexus.invalid', 4, 'Book the paid media flight for October', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 7.30, 'Finished book the paid media flight for october this week.'),
      ('temitope.oladele@nexus.invalid|4|2', 'temitope.oladele@nexus.invalid', 4, 'Launch the Q4 demand campaign', 'campaign', 'normal', 'partial', true, 'none', null, true, null, 13.00, 11.90, 'Planning to launch the q4 demand campaign.'),
      ('temitope.oladele@nexus.invalid|4|3', 'temitope.oladele@nexus.invalid', 4, 'Ship the campaign landing page', 'campaign', 'high', 'delivered', false, 'none', null, true, null, 9.00, 9.60, 'Finished ship the campaign landing page this week.'),
      ('temitope.oladele@nexus.invalid|5|0', 'temitope.oladele@nexus.invalid', 5, 'Book the paid media flight for October', 'campaign', 'normal', 'partial', true, 'none', null, true, null, 12.00, 12.60, 'Planning to book the paid media flight for october.'),
      ('temitope.oladele@nexus.invalid|5|1', 'temitope.oladele@nexus.invalid', 5, 'Produce the product launch explainer', 'content', 'normal', 'dropped', true, 'none', null, true, null, 13.00, null, 'Planning to produce the product launch explainer.'),
      ('temitope.oladele@nexus.invalid|5|2', 'temitope.oladele@nexus.invalid', 5, 'Publish the October editorial calendar', 'content', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 14.90, 'Finished publish the october editorial calendar this week.'),
      ('temitope.oladele@nexus.invalid|5|3', 'temitope.oladele@nexus.invalid', 5, 'Launch the Q4 demand campaign', 'campaign', 'critical', 'partial', false, 'none', null, true, null, 9.00, 9.40, 'Planning to launch the q4 demand campaign.'),
      ('temitope.oladele@nexus.invalid|6|0', 'temitope.oladele@nexus.invalid', 6, 'Run the customer story interviews', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 8.00, 'Finished run the customer story interviews this week.'),
      ('temitope.oladele@nexus.invalid|6|1', 'temitope.oladele@nexus.invalid', 6, 'Ship the campaign landing page', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 4.00, 'Finished ship the campaign landing page this week.'),
      ('temitope.oladele@nexus.invalid|6|2', 'temitope.oladele@nexus.invalid', 6, 'Publish the October editorial calendar', 'content', 'normal', 'partial', false, 'none', null, true, null, 4.00, 4.10, 'Planning to publish the october editorial calendar.'),
      ('temitope.oladele@nexus.invalid|6|3', 'temitope.oladele@nexus.invalid', 6, 'Book the paid media flight for October', 'campaign', 'normal', 'partial', false, 'none', null, true, null, 4.00, 4.20, 'Planning to book the paid media flight for october.'),
      ('temitope.oladele@nexus.invalid|6|4', 'temitope.oladele@nexus.invalid', 6, 'Rewrite the onboarding email sequence', 'content', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.30, 'Finished rewrite the onboarding email sequence this week.'),
      ('temitope.oladele@nexus.invalid|7|0', 'temitope.oladele@nexus.invalid', 7, 'Book the paid media flight for October', 'campaign', 'high', 'delivered', false, 'none', null, true, null, 5.00, 5.00, 'Finished book the paid media flight for october this week.'),
      ('temitope.oladele@nexus.invalid|7|1', 'temitope.oladele@nexus.invalid', 7, 'Launch the Q4 demand campaign', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.50, 'Finished launch the q4 demand campaign this week.'),
      ('temitope.oladele@nexus.invalid|7|2', 'temitope.oladele@nexus.invalid', 7, 'Run the customer story interviews', 'campaign', 'normal', 'in_progress', false, 'none', null, true, null, 5.00, null, 'Planning to run the customer story interviews.'),
      ('temitope.oladele@nexus.invalid|7|3', 'temitope.oladele@nexus.invalid', 7, 'Rewrite the onboarding email sequence', 'content', 'normal', 'deferred', false, 'none', null, true, null, 7.00, null, 'Planning to rewrite the onboarding email sequence.'),
      ('temitope.oladele@nexus.invalid|7|4', 'temitope.oladele@nexus.invalid', 7, 'Ship the campaign landing page', 'campaign', 'high', 'delivered', false, 'none', null, true, null, 7.00, 7.60, 'Finished ship the campaign landing page this week.'),
      ('uche.nwankwo@nexus.invalid|0|0', 'uche.nwankwo@nexus.invalid', 0, 'Wait on Finance to licence the RPA platform', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 9.00, null, 'Still stuck on wait on finance to licence the rpa platform — waiting on Finance.'),
      ('uche.nwankwo@nexus.invalid|0|1', 'uche.nwankwo@nexus.invalid', 0, 'Hold the campaign flight until the Q4 budget is released', 'campaign', 'high', 'blocked', true, 'external_team', 'finance', true, null, 9.00, null, 'Still stuck on hold the campaign flight until the q4 budget is released — waiting on Finance.'),
      ('uche.nwankwo@nexus.invalid|0|2', 'uche.nwankwo@nexus.invalid', 0, 'Rewrite the onboarding email sequence', 'content', 'normal', 'in_progress', false, 'none', null, true, null, 8.00, null, 'Planning to rewrite the onboarding email sequence.'),
      ('uche.nwankwo@nexus.invalid|0|3', 'uche.nwankwo@nexus.invalid', 0, 'Run the customer story interviews', 'campaign', 'normal', 'partial', true, 'none', null, true, null, 12.00, 11.40, 'Planning to run the customer story interviews.'),
      ('uche.nwankwo@nexus.invalid|1|0', 'uche.nwankwo@nexus.invalid', 1, 'Wait on Finance to licence the RPA platform', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 6.00, null, 'Still stuck on wait on finance to licence the rpa platform — waiting on Finance.'),
      ('uche.nwankwo@nexus.invalid|1|1', 'uche.nwankwo@nexus.invalid', 1, 'Hold the campaign flight until the Q4 budget is released', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 10.00, null, 'Still stuck on hold the campaign flight until the q4 budget is released — waiting on Finance.'),
      ('uche.nwankwo@nexus.invalid|1|2', 'uche.nwankwo@nexus.invalid', 1, 'Produce the product launch explainer', 'content', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 8.30, 'Finished produce the product launch explainer this week.'),
      ('uche.nwankwo@nexus.invalid|1|3', 'uche.nwankwo@nexus.invalid', 1, 'Book the paid media flight for October', 'campaign', 'normal', 'dropped', true, 'none', null, true, null, 6.00, null, 'Planning to book the paid media flight for october.'),
      ('uche.nwankwo@nexus.invalid|1|4', 'uche.nwankwo@nexus.invalid', 1, 'Run the customer story interviews', 'campaign', 'normal', 'in_progress', false, 'none', null, true, null, 6.00, null, 'Planning to run the customer story interviews.'),
      ('uche.nwankwo@nexus.invalid|2|0', 'uche.nwankwo@nexus.invalid', 2, 'Wait on Finance to licence the RPA platform', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 10.00, null, 'Still stuck on wait on finance to licence the rpa platform — waiting on Finance.'),
      ('uche.nwankwo@nexus.invalid|2|1', 'uche.nwankwo@nexus.invalid', 2, 'Hold the campaign flight until the Q4 budget is released', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 10.00, null, 'Still stuck on hold the campaign flight until the q4 budget is released — waiting on Finance.'),
      ('uche.nwankwo@nexus.invalid|2|2', 'uche.nwankwo@nexus.invalid', 2, 'Launch the Q4 demand campaign', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 8.40, 'Finished launch the q4 demand campaign this week.'),
      ('uche.nwankwo@nexus.invalid|2|3', 'uche.nwankwo@nexus.invalid', 2, 'Book the paid media flight for October', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.00, 'Finished book the paid media flight for october this week.'),
      ('uche.nwankwo@nexus.invalid|3|0', 'uche.nwankwo@nexus.invalid', 3, 'Wait on Finance to licence the RPA platform', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 13.00, null, 'Still stuck on wait on finance to licence the rpa platform — waiting on Finance.'),
      ('uche.nwankwo@nexus.invalid|3|1', 'uche.nwankwo@nexus.invalid', 3, 'Hold the campaign flight until the Q4 budget is released', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 7.00, null, 'Still stuck on hold the campaign flight until the q4 budget is released — waiting on Finance.'),
      ('uche.nwankwo@nexus.invalid|3|2', 'uche.nwankwo@nexus.invalid', 3, 'Ship the campaign landing page', 'campaign', 'normal', 'in_progress', true, 'none', null, true, null, 5.00, null, 'Planning to ship the campaign landing page.'),
      ('uche.nwankwo@nexus.invalid|3|3', 'uche.nwankwo@nexus.invalid', 3, 'Book the paid media flight for October', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.70, 'Finished book the paid media flight for october this week.'),
      ('uche.nwankwo@nexus.invalid|4|0', 'uche.nwankwo@nexus.invalid', 4, 'Wait on Finance to licence the RPA platform', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 12.00, null, 'Still stuck on wait on finance to licence the rpa platform — waiting on Finance.'),
      ('uche.nwankwo@nexus.invalid|4|1', 'uche.nwankwo@nexus.invalid', 4, 'Hold the campaign flight until the Q4 budget is released', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 13.00, null, 'Still stuck on hold the campaign flight until the q4 budget is released — waiting on Finance.'),
      ('uche.nwankwo@nexus.invalid|4|2', 'uche.nwankwo@nexus.invalid', 4, 'Rewrite the onboarding email sequence', 'content', 'normal', 'delivered', false, 'none', null, true, null, 14.00, 15.60, 'Finished rewrite the onboarding email sequence this week.'),
      ('uche.nwankwo@nexus.invalid|5|0', 'uche.nwankwo@nexus.invalid', 5, 'Wait on Finance to licence the RPA platform', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 8.00, null, 'Still stuck on wait on finance to licence the rpa platform — waiting on Finance.'),
      ('uche.nwankwo@nexus.invalid|5|1', 'uche.nwankwo@nexus.invalid', 5, 'Hold the campaign flight until the Q4 budget is released', 'campaign', 'critical', 'blocked', true, 'external_team', 'finance', true, null, 8.00, null, 'Still stuck on hold the campaign flight until the q4 budget is released — waiting on Finance.'),
      ('uche.nwankwo@nexus.invalid|5|2', 'uche.nwankwo@nexus.invalid', 5, 'Rewrite the onboarding email sequence', 'content', 'normal', 'deferred', true, 'none', null, true, null, 11.00, null, 'Planning to rewrite the onboarding email sequence.'),
      ('uche.nwankwo@nexus.invalid|5|3', 'uche.nwankwo@nexus.invalid', 5, 'Launch the Q4 demand campaign', 'campaign', 'normal', 'dropped', true, 'none', null, true, null, 4.00, null, 'Planning to launch the q4 demand campaign.'),
      ('uche.nwankwo@nexus.invalid|6|0', 'uche.nwankwo@nexus.invalid', 6, 'Wait on Finance to licence the RPA platform', 'campaign', 'high', 'blocked', true, 'external_team', 'finance', true, null, 6.00, null, 'Still stuck on wait on finance to licence the rpa platform — waiting on Finance.'),
      ('uche.nwankwo@nexus.invalid|6|1', 'uche.nwankwo@nexus.invalid', 6, 'Hold the campaign flight until the Q4 budget is released', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 7.00, null, 'Still stuck on hold the campaign flight until the q4 budget is released — waiting on Finance.'),
      ('uche.nwankwo@nexus.invalid|6|2', 'uche.nwankwo@nexus.invalid', 6, 'Produce the product launch explainer', 'content', 'normal', 'partial', false, 'none', null, true, null, 6.00, 5.40, 'Planning to produce the product launch explainer.'),
      ('uche.nwankwo@nexus.invalid|6|3', 'uche.nwankwo@nexus.invalid', 6, 'Launch the Q4 demand campaign', 'campaign', 'high', 'delivered', false, 'none', null, true, null, 9.00, 10.10, 'Finished launch the q4 demand campaign this week.'),
      ('uche.nwankwo@nexus.invalid|7|0', 'uche.nwankwo@nexus.invalid', 7, 'Wait on Finance to licence the RPA platform', 'campaign', 'normal', 'blocked', true, 'external_team', 'finance', true, null, 10.00, null, 'Still stuck on wait on finance to licence the rpa platform — waiting on Finance.'),
      ('uche.nwankwo@nexus.invalid|7|1', 'uche.nwankwo@nexus.invalid', 7, 'Hold the campaign flight until the Q4 budget is released', 'campaign', 'high', 'blocked', true, 'external_team', 'finance', true, null, 12.00, null, 'Still stuck on hold the campaign flight until the q4 budget is released — waiting on Finance.'),
      ('uche.nwankwo@nexus.invalid|7|2', 'uche.nwankwo@nexus.invalid', 7, 'Launch the Q4 demand campaign', 'campaign', 'normal', 'in_progress', true, 'none', null, true, null, 6.00, null, 'Planning to launch the q4 demand campaign.'),
      ('uche.nwankwo@nexus.invalid|7|3', 'uche.nwankwo@nexus.invalid', 7, 'Publish the October editorial calendar', 'content', 'normal', 'partial', false, 'none', null, true, null, 4.00, 4.00, 'Planning to publish the october editorial calendar.'),
      ('aisha.lawal@nexus.invalid|0|0', 'aisha.lawal@nexus.invalid', 0, 'Launch the Q4 demand campaign', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 6.30, 'Finished launch the q4 demand campaign this week.'),
      ('aisha.lawal@nexus.invalid|0|1', 'aisha.lawal@nexus.invalid', 0, 'Produce the product launch explainer', 'content', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 9.20, 'Finished produce the product launch explainer this week.'),
      ('aisha.lawal@nexus.invalid|0|2', 'aisha.lawal@nexus.invalid', 0, 'Book the paid media flight for October', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.60, 'Finished book the paid media flight for october this week.'),
      ('aisha.lawal@nexus.invalid|1|0', 'aisha.lawal@nexus.invalid', 1, 'Book the paid media flight for October', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 11.00, 12.60, 'Finished book the paid media flight for october this week.'),
      ('aisha.lawal@nexus.invalid|1|1', 'aisha.lawal@nexus.invalid', 1, 'Launch the Q4 demand campaign', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 3.60, 'Finished launch the q4 demand campaign this week.'),
      ('aisha.lawal@nexus.invalid|1|2', 'aisha.lawal@nexus.invalid', 1, 'Run the customer story interviews', 'campaign', 'high', 'delivered', false, 'none', null, true, null, 3.00, 2.70, 'Finished run the customer story interviews this week.'),
      ('aisha.lawal@nexus.invalid|1|3', 'aisha.lawal@nexus.invalid', 1, 'Publish the October editorial calendar', 'content', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 8.40, 'Finished publish the october editorial calendar this week.'),
      ('aisha.lawal@nexus.invalid|2|0', 'aisha.lawal@nexus.invalid', 2, 'Book the paid media flight for October', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 5.80, 'Finished book the paid media flight for october this week.'),
      ('aisha.lawal@nexus.invalid|2|1', 'aisha.lawal@nexus.invalid', 2, 'Run the customer story interviews', 'campaign', 'high', 'delivered', false, 'none', null, true, null, 8.00, 8.00, 'Finished run the customer story interviews this week.'),
      ('aisha.lawal@nexus.invalid|2|2', 'aisha.lawal@nexus.invalid', 2, 'Launch the Q4 demand campaign', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 7.00, 'Finished launch the q4 demand campaign this week.'),
      ('aisha.lawal@nexus.invalid|3|0', 'aisha.lawal@nexus.invalid', 3, 'Launch the Q4 demand campaign', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 9.50, 'Finished launch the q4 demand campaign this week.'),
      ('aisha.lawal@nexus.invalid|3|1', 'aisha.lawal@nexus.invalid', 3, 'Run the customer story interviews', 'campaign', 'normal', 'deferred', true, 'none', null, true, null, 8.00, null, 'Planning to run the customer story interviews.'),
      ('aisha.lawal@nexus.invalid|3|2', 'aisha.lawal@nexus.invalid', 3, 'Rewrite the onboarding email sequence', 'content', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 12.60, 'Finished rewrite the onboarding email sequence this week.'),
      ('aisha.lawal@nexus.invalid|3|3', 'aisha.lawal@nexus.invalid', 3, 'Produce the product launch explainer', 'content', 'high', 'delivered', false, 'none', null, true, null, 11.00, 9.50, 'Finished produce the product launch explainer this week.'),
      ('aisha.lawal@nexus.invalid|4|0', 'aisha.lawal@nexus.invalid', 4, 'Run the customer story interviews', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 12.20, 'Finished run the customer story interviews this week.'),
      ('aisha.lawal@nexus.invalid|4|1', 'aisha.lawal@nexus.invalid', 4, 'Book the paid media flight for October', 'campaign', 'normal', 'deferred', true, 'none', null, true, null, 7.00, null, 'Planning to book the paid media flight for october.'),
      ('aisha.lawal@nexus.invalid|4|2', 'aisha.lawal@nexus.invalid', 4, 'Rewrite the onboarding email sequence', 'content', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 8.40, 'Finished rewrite the onboarding email sequence this week.'),
      ('aisha.lawal@nexus.invalid|5|0', 'aisha.lawal@nexus.invalid', 5, 'Run the customer story interviews', 'campaign', 'high', 'delivered', false, 'none', null, true, null, 6.00, 6.50, 'Finished run the customer story interviews this week.'),
      ('aisha.lawal@nexus.invalid|5|1', 'aisha.lawal@nexus.invalid', 5, 'Rewrite the onboarding email sequence', 'content', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 9.20, 'Finished rewrite the onboarding email sequence this week.'),
      ('aisha.lawal@nexus.invalid|5|2', 'aisha.lawal@nexus.invalid', 5, 'Launch the Q4 demand campaign', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.70, 'Finished launch the q4 demand campaign this week.'),
      ('aisha.lawal@nexus.invalid|5|3', 'aisha.lawal@nexus.invalid', 5, 'Publish the October editorial calendar', 'content', 'high', 'delivered', false, 'none', null, true, null, 12.00, 11.70, 'Finished publish the october editorial calendar this week.'),
      ('aisha.lawal@nexus.invalid|6|0', 'aisha.lawal@nexus.invalid', 6, 'Launch the Q4 demand campaign', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 3.90, 'Finished launch the q4 demand campaign this week.'),
      ('aisha.lawal@nexus.invalid|6|1', 'aisha.lawal@nexus.invalid', 6, 'Book the paid media flight for October', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 13.70, 'Finished book the paid media flight for october this week.'),
      ('aisha.lawal@nexus.invalid|6|2', 'aisha.lawal@nexus.invalid', 6, 'Ship the campaign landing page', 'campaign', 'normal', 'deferred', true, 'none', null, true, null, 8.00, null, 'Planning to ship the campaign landing page.'),
      ('aisha.lawal@nexus.invalid|7|0', 'aisha.lawal@nexus.invalid', 7, 'Launch the Q4 demand campaign', 'campaign', 'high', 'deferred', true, 'none', null, true, null, 9.00, null, 'Planning to launch the q4 demand campaign.'),
      ('aisha.lawal@nexus.invalid|7|1', 'aisha.lawal@nexus.invalid', 7, 'Ship the campaign landing page', 'campaign', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 7.80, 'Finished ship the campaign landing page this week.'),
      ('aisha.lawal@nexus.invalid|7|2', 'aisha.lawal@nexus.invalid', 7, 'Publish the October editorial calendar', 'content', 'high', 'delivered', false, 'none', null, true, null, 8.00, 7.00, 'Finished publish the october editorial calendar this week.'),
      ('aisha.lawal@nexus.invalid|7|3', 'aisha.lawal@nexus.invalid', 7, 'Produce the product launch explainer', 'content', 'high', 'deferred', true, 'none', null, true, null, 13.00, null, 'Planning to produce the product launch explainer.'),
      ('folake.durojaiye@nexus.invalid|0|0', 'folake.durojaiye@nexus.invalid', 0, 'Sign off the employee data handling policy', 'policy', 'normal', 'partial', false, 'none', null, true, null, 5.00, 5.30, 'Planning to sign off the employee data handling policy.'),
      ('folake.durojaiye@nexus.invalid|0|1', 'folake.durojaiye@nexus.invalid', 0, 'Refresh the onboarding handbook', 'policy', 'normal', 'dropped', true, 'none', null, true, null, 3.00, null, 'Planning to refresh the onboarding handbook.'),
      ('folake.durojaiye@nexus.invalid|0|2', 'folake.durojaiye@nexus.invalid', 0, 'Handle the escalated grievance case', 'hiring', 'normal', 'delivered', false, 'none', null, false, null, 4.00, 3.60, 'Finished handle the escalated grievance case this week.'),
      ('folake.durojaiye@nexus.invalid|1|0', 'folake.durojaiye@nexus.invalid', 1, 'Handle the escalated grievance case', 'hiring', 'high', 'delivered', false, 'none', null, false, null, 13.00, 11.90, 'Finished handle the escalated grievance case this week.'),
      ('folake.durojaiye@nexus.invalid|1|1', 'folake.durojaiye@nexus.invalid', 1, 'Complete the quarterly right-to-work checks', 'policy', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 11.60, 'Finished complete the quarterly right-to-work checks this week.'),
      ('folake.durojaiye@nexus.invalid|1|2', 'folake.durojaiye@nexus.invalid', 1, 'Cover the unplanned exit interview and handover', 'policy', 'normal', 'delivered', false, 'none', null, false, null, 5.00, 5.00, 'Finished cover the unplanned exit interview and handover this week.'),
      ('folake.durojaiye@nexus.invalid|1|3', 'folake.durojaiye@nexus.invalid', 1, 'Close out the two open engineering offers', 'hiring', 'normal', 'delivered', false, 'none', null, true, null, 7.00, 7.60, 'Finished close out the two open engineering offers this week.'),
      ('folake.durojaiye@nexus.invalid|1|4', 'folake.durojaiye@nexus.invalid', 1, 'Pull the headcount numbers for the board meeting', 'policy', 'normal', 'delivered', false, 'none', null, false, null, 11.00, 10.00, 'Finished pull the headcount numbers for the board meeting this week.'),
      ('folake.durojaiye@nexus.invalid|2|0', 'folake.durojaiye@nexus.invalid', 2, 'Publish the updated role scorecards', 'hiring', 'high', 'partial', false, 'none', null, true, null, 13.00, 14.80, 'Planning to publish the updated role scorecards.'),
      ('folake.durojaiye@nexus.invalid|2|1', 'folake.durojaiye@nexus.invalid', 2, 'Run the interview panel calibration session', 'hiring', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.60, 'Finished run the interview panel calibration session this week.'),
      ('folake.durojaiye@nexus.invalid|2|2', 'folake.durojaiye@nexus.invalid', 2, 'Handle the escalated grievance case', 'policy', 'normal', 'delivered', false, 'none', null, false, null, 12.00, 13.70, 'Finished handle the escalated grievance case this week.'),
      ('folake.durojaiye@nexus.invalid|2|3', 'folake.durojaiye@nexus.invalid', 2, 'Complete the quarterly right-to-work checks', 'policy', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 10.50, 'Finished complete the quarterly right-to-work checks this week.'),
      ('folake.durojaiye@nexus.invalid|3|0', 'folake.durojaiye@nexus.invalid', 3, 'Handle the escalated grievance case', 'hiring', 'normal', 'delivered', false, 'none', null, false, null, 3.00, 3.40, 'Finished handle the escalated grievance case this week.'),
      ('folake.durojaiye@nexus.invalid|3|1', 'folake.durojaiye@nexus.invalid', 3, 'Refresh the onboarding handbook', 'policy', 'high', 'delivered', false, 'none', null, true, null, 10.00, 10.90, 'Finished refresh the onboarding handbook this week.'),
      ('folake.durojaiye@nexus.invalid|3|2', 'folake.durojaiye@nexus.invalid', 3, 'Finish the annual leave policy update', 'policy', 'high', 'delivered', false, 'none', null, true, null, 8.00, 8.90, 'Finished finish the annual leave policy update this week.'),
      ('folake.durojaiye@nexus.invalid|3|3', 'folake.durojaiye@nexus.invalid', 3, 'Cover the unplanned exit interview and handover', 'policy', 'high', 'delivered', false, 'none', null, false, null, 3.00, 3.10, 'Finished cover the unplanned exit interview and handover this week.'),
      ('folake.durojaiye@nexus.invalid|3|4', 'folake.durojaiye@nexus.invalid', 3, 'Close out the two open engineering offers', 'hiring', 'normal', 'deferred', true, 'none', null, true, null, 7.00, null, 'Planning to close out the two open engineering offers.'),
      ('folake.durojaiye@nexus.invalid|4|0', 'folake.durojaiye@nexus.invalid', 4, 'Handle the escalated grievance case', 'policy', 'normal', 'delivered', false, 'none', null, false, null, 4.00, 4.50, 'Finished handle the escalated grievance case this week.'),
      ('folake.durojaiye@nexus.invalid|4|1', 'folake.durojaiye@nexus.invalid', 4, 'Cover the unplanned exit interview and handover', 'hiring', 'normal', 'delivered', false, 'none', null, false, null, 10.00, 9.60, 'Finished cover the unplanned exit interview and handover this week.'),
      ('folake.durojaiye@nexus.invalid|4|2', 'folake.durojaiye@nexus.invalid', 4, 'Sign off the employee data handling policy', 'policy', 'high', 'delivered', false, 'none', null, true, null, 5.00, 5.40, 'Finished sign off the employee data handling policy this week.'),
      ('folake.durojaiye@nexus.invalid|4|3', 'folake.durojaiye@nexus.invalid', 4, 'Pull the headcount numbers for the board meeting', 'policy', 'normal', 'delivered', false, 'none', null, false, null, 9.00, 8.30, 'Finished pull the headcount numbers for the board meeting this week.'),
      ('folake.durojaiye@nexus.invalid|4|4', 'folake.durojaiye@nexus.invalid', 4, 'Re-run payroll checks after the supplier error', 'policy', 'normal', 'delivered', false, 'none', null, false, null, 6.00, 6.30, 'Finished re-run payroll checks after the supplier error this week.'),
      ('folake.durojaiye@nexus.invalid|5|0', 'folake.durojaiye@nexus.invalid', 5, 'Handle the escalated grievance case', 'policy', 'normal', 'delivered', false, 'none', null, false, null, 4.00, 4.20, 'Finished handle the escalated grievance case this week.'),
      ('folake.durojaiye@nexus.invalid|5|1', 'folake.durojaiye@nexus.invalid', 5, 'Cover the unplanned exit interview and handover', 'hiring', 'normal', 'delivered', false, 'none', null, false, null, 13.00, 11.60, 'Finished cover the unplanned exit interview and handover this week.'),
      ('folake.durojaiye@nexus.invalid|5|2', 'folake.durojaiye@nexus.invalid', 5, 'Refresh the onboarding handbook', 'policy', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 6.80, 'Finished refresh the onboarding handbook this week.'),
      ('folake.durojaiye@nexus.invalid|5|3', 'folake.durojaiye@nexus.invalid', 5, 'Run the interview panel calibration session', 'hiring', 'normal', 'partial', true, 'none', null, true, null, 7.00, 6.80, 'Planning to run the interview panel calibration session.'),
      ('folake.durojaiye@nexus.invalid|6|0', 'folake.durojaiye@nexus.invalid', 6, 'Close out the two open engineering offers', 'hiring', 'high', 'dropped', true, 'none', null, true, null, 7.00, null, 'Planning to close out the two open engineering offers.'),
      ('folake.durojaiye@nexus.invalid|6|1', 'folake.durojaiye@nexus.invalid', 6, 'Handle the escalated grievance case', 'policy', 'normal', 'delivered', false, 'none', null, false, null, 12.00, 11.10, 'Finished handle the escalated grievance case this week.'),
      ('folake.durojaiye@nexus.invalid|6|2', 'folake.durojaiye@nexus.invalid', 6, 'Run the interview panel calibration session', 'hiring', 'critical', 'deferred', true, 'none', null, true, null, 10.00, null, 'Planning to run the interview panel calibration session.'),
      ('folake.durojaiye@nexus.invalid|7|0', 'folake.durojaiye@nexus.invalid', 7, 'Handle the escalated grievance case', 'policy', 'high', 'delivered', false, 'none', null, false, null, 8.00, 8.90, 'Finished handle the escalated grievance case this week.'),
      ('folake.durojaiye@nexus.invalid|7|1', 'folake.durojaiye@nexus.invalid', 7, 'Run the interview panel calibration session', 'hiring', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.20, 'Finished run the interview panel calibration session this week.'),
      ('folake.durojaiye@nexus.invalid|7|2', 'folake.durojaiye@nexus.invalid', 7, 'Cover the unplanned exit interview and handover', 'hiring', 'high', 'delivered', false, 'none', null, false, null, 13.00, 14.50, 'Finished cover the unplanned exit interview and handover this week.'),
      ('folake.durojaiye@nexus.invalid|7|3', 'folake.durojaiye@nexus.invalid', 7, 'Publish the updated role scorecards', 'hiring', 'normal', 'delivered', false, 'none', null, true, null, 5.00, 5.30, 'Finished publish the updated role scorecards this week.'),
      ('kunle.oyelaran@nexus.invalid|0|0', 'kunle.oyelaran@nexus.invalid', 0, 'Complete the quarterly right-to-work checks', 'policy', 'normal', 'deferred', true, 'none', null, true, null, 10.00, null, 'Planning to complete the quarterly right-to-work checks.'),
      ('kunle.oyelaran@nexus.invalid|0|1', 'kunle.oyelaran@nexus.invalid', 0, 'Finish the annual leave policy update', 'policy', 'high', 'delivered', false, 'none', null, true, null, 11.00, 11.90, 'Finished finish the annual leave policy update this week.'),
      ('kunle.oyelaran@nexus.invalid|0|2', 'kunle.oyelaran@nexus.invalid', 0, 'Publish the updated role scorecards', 'hiring', 'high', 'delivered', false, 'none', null, true, null, 10.00, 8.80, 'Finished publish the updated role scorecards this week.'),
      ('kunle.oyelaran@nexus.invalid|0|3', 'kunle.oyelaran@nexus.invalid', 0, 'Close out the two open engineering offers', 'hiring', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 8.10, 'Finished close out the two open engineering offers this week.'),
      ('kunle.oyelaran@nexus.invalid|0|4', 'kunle.oyelaran@nexus.invalid', 0, 'Sign off the employee data handling policy', 'policy', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 7.90, 'Finished sign off the employee data handling policy this week.'),
      ('kunle.oyelaran@nexus.invalid|1|0', 'kunle.oyelaran@nexus.invalid', 1, 'Complete the quarterly right-to-work checks', 'policy', 'normal', 'dropped', true, 'none', null, true, null, 6.00, null, 'Planning to complete the quarterly right-to-work checks.'),
      ('kunle.oyelaran@nexus.invalid|1|1', 'kunle.oyelaran@nexus.invalid', 1, 'Publish the updated role scorecards', 'hiring', 'high', 'delivered', false, 'none', null, true, null, 10.00, 10.10, 'Finished publish the updated role scorecards this week.'),
      ('kunle.oyelaran@nexus.invalid|1|2', 'kunle.oyelaran@nexus.invalid', 1, 'Finish the annual leave policy update', 'policy', 'high', 'partial', false, 'none', null, true, null, 10.00, 11.50, 'Planning to finish the annual leave policy update.'),
      ('kunle.oyelaran@nexus.invalid|1|3', 'kunle.oyelaran@nexus.invalid', 1, 'Run the interview panel calibration session', 'hiring', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 7.70, 'Finished run the interview panel calibration session this week.'),
      ('kunle.oyelaran@nexus.invalid|2|0', 'kunle.oyelaran@nexus.invalid', 2, 'Sign off the employee data handling policy', 'policy', 'normal', 'delivered', false, 'none', null, true, null, 12.00, 12.40, 'Finished sign off the employee data handling policy this week.'),
      ('kunle.oyelaran@nexus.invalid|2|1', 'kunle.oyelaran@nexus.invalid', 2, 'Close out the two open engineering offers', 'hiring', 'normal', 'partial', true, 'none', null, true, null, 10.00, 9.50, 'Planning to close out the two open engineering offers.'),
      ('kunle.oyelaran@nexus.invalid|2|2', 'kunle.oyelaran@nexus.invalid', 2, 'Run the interview panel calibration session', 'hiring', 'normal', 'delivered', false, 'none', null, true, null, 3.00, 3.30, 'Finished run the interview panel calibration session this week.'),
      ('kunle.oyelaran@nexus.invalid|2|3', 'kunle.oyelaran@nexus.invalid', 2, 'Finish the annual leave policy update', 'policy', 'critical', 'partial', false, 'none', null, true, null, 8.00, 7.00, 'Planning to finish the annual leave policy update.'),
      ('kunle.oyelaran@nexus.invalid|3|0', 'kunle.oyelaran@nexus.invalid', 3, 'Finish the annual leave policy update', 'policy', 'normal', 'delivered', false, 'none', null, true, null, 9.00, 8.20, 'Finished finish the annual leave policy update this week.'),
      ('kunle.oyelaran@nexus.invalid|3|1', 'kunle.oyelaran@nexus.invalid', 3, 'Refresh the onboarding handbook', 'policy', 'high', 'delivered', false, 'none', null, true, null, 11.00, 11.40, 'Finished refresh the onboarding handbook this week.'),
      ('kunle.oyelaran@nexus.invalid|3|2', 'kunle.oyelaran@nexus.invalid', 3, 'Run the interview panel calibration session', 'hiring', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 3.50, 'Finished run the interview panel calibration session this week.'),
      ('kunle.oyelaran@nexus.invalid|3|3', 'kunle.oyelaran@nexus.invalid', 3, 'Close out the two open engineering offers', 'hiring', 'normal', 'dropped', false, 'none', null, true, null, 11.00, null, 'Planning to close out the two open engineering offers.'),
      ('kunle.oyelaran@nexus.invalid|3|4', 'kunle.oyelaran@nexus.invalid', 3, 'Complete the quarterly right-to-work checks', 'policy', 'normal', 'in_progress', false, 'none', null, true, null, 10.00, null, 'Planning to complete the quarterly right-to-work checks.'),
      ('kunle.oyelaran@nexus.invalid|4|0', 'kunle.oyelaran@nexus.invalid', 4, 'Refresh the onboarding handbook', 'policy', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 9.40, 'Finished refresh the onboarding handbook this week.'),
      ('kunle.oyelaran@nexus.invalid|4|1', 'kunle.oyelaran@nexus.invalid', 4, 'Close out the two open engineering offers', 'hiring', 'normal', 'partial', true, 'none', null, true, null, 5.00, 5.60, 'Planning to close out the two open engineering offers.'),
      ('kunle.oyelaran@nexus.invalid|4|2', 'kunle.oyelaran@nexus.invalid', 4, 'Publish the updated role scorecards', 'hiring', 'normal', 'delivered', false, 'none', null, true, null, 6.00, 6.60, 'Finished publish the updated role scorecards this week.'),
      ('kunle.oyelaran@nexus.invalid|5|0', 'kunle.oyelaran@nexus.invalid', 5, 'Publish the updated role scorecards', 'hiring', 'normal', 'partial', false, 'none', null, true, null, 9.00, 8.00, 'Planning to publish the updated role scorecards.'),
      ('kunle.oyelaran@nexus.invalid|5|1', 'kunle.oyelaran@nexus.invalid', 5, 'Close out the two open engineering offers', 'hiring', 'normal', 'deferred', true, 'none', null, true, null, 7.00, null, 'Planning to close out the two open engineering offers.'),
      ('kunle.oyelaran@nexus.invalid|5|2', 'kunle.oyelaran@nexus.invalid', 5, 'Sign off the employee data handling policy', 'policy', 'normal', 'delivered', false, 'none', null, true, null, 4.00, 4.00, 'Finished sign off the employee data handling policy this week.'),
      ('kunle.oyelaran@nexus.invalid|6|0', 'kunle.oyelaran@nexus.invalid', 6, 'Finish the annual leave policy update', 'policy', 'normal', 'delivered', false, 'none', null, true, null, 13.00, 12.40, 'Finished finish the annual leave policy update this week.'),
      ('kunle.oyelaran@nexus.invalid|6|1', 'kunle.oyelaran@nexus.invalid', 6, 'Close out the two open engineering offers', 'hiring', 'normal', 'delivered', false, 'none', null, true, null, 8.00, 7.90, 'Finished close out the two open engineering offers this week.'),
      ('kunle.oyelaran@nexus.invalid|6|2', 'kunle.oyelaran@nexus.invalid', 6, 'Refresh the onboarding handbook', 'policy', 'normal', 'delivered', false, 'none', null, true, null, 14.00, 13.20, 'Finished refresh the onboarding handbook this week.'),
      ('kunle.oyelaran@nexus.invalid|6|3', 'kunle.oyelaran@nexus.invalid', 6, 'Sign off the employee data handling policy', 'policy', 'normal', 'partial', true, 'none', null, true, null, 12.00, 10.50, 'Planning to sign off the employee data handling policy.'),
      ('kunle.oyelaran@nexus.invalid|6|4', 'kunle.oyelaran@nexus.invalid', 6, 'Complete the quarterly right-to-work checks', 'policy', 'normal', 'dropped', true, 'none', null, true, null, 8.00, null, 'Planning to complete the quarterly right-to-work checks.'),
      ('kunle.oyelaran@nexus.invalid|7|0', 'kunle.oyelaran@nexus.invalid', 7, 'Complete the quarterly right-to-work checks', 'policy', 'normal', 'dropped', false, 'none', null, true, null, 13.00, null, 'Planning to complete the quarterly right-to-work checks.'),
      ('kunle.oyelaran@nexus.invalid|7|1', 'kunle.oyelaran@nexus.invalid', 7, 'Publish the updated role scorecards', 'hiring', 'normal', 'partial', true, 'none', null, true, null, 10.00, 9.90, 'Planning to publish the updated role scorecards.'),
      ('kunle.oyelaran@nexus.invalid|7|2', 'kunle.oyelaran@nexus.invalid', 7, 'Finish the annual leave policy update', 'policy', 'high', 'partial', false, 'none', null, true, null, 6.00, 5.60, 'Planning to finish the annual leave policy update.'),
      ('kunle.oyelaran@nexus.invalid|7|3', 'kunle.oyelaran@nexus.invalid', 7, 'Close out the two open engineering offers', 'hiring', 'normal', 'delivered', false, 'none', null, true, null, 10.00, 9.80, 'Finished close out the two open engineering offers this week.');

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
  -- The prose restates the same narratives the reconciliation engine finds on
  -- its own — the six-week carry, the Finance bottleneck holding up two
  -- separate units, and the silent drops inside Finance that explain it. It
  -- sits on the same screen as those findings, so anything else here would
  -- read as the system contradicting itself.
  insert into digests (org_id, scope, scope_id, period, cycle_id, status,
                       subject, summary_json, recipients, sent_at, created_at)
  select
    v_org, 'executive', null, 'weekly', cy.id, 'sent',
    'Finance is now holding up two units, and it does not know it',
    '{
      "subject": "Finance is now holding up two units, and it does not know it",
      "headline": "Delivery held at last week''s level, but the same Finance approvals are now blocking both Automation and Marketing, and five commitments closed inside Finance without anyone saying what happened to them.",
      "whatChanged": [
        "The supplier onboarding bot has now been carried six weeks running.",
        "Finance is blocking Automation and Marketing at the same time.",
        "Five commitments across Finance closed with no status update.",
        "Marketing declared every deviation in time for the second week running."
      ],
      "decisions": [
        {
          "risk": "Two units are waiting on the same Finance approvals — the licence and the Q4 budget — and both flagged it every week. This is one decision, not two delays.",
          "action": "Clear both approvals in one sitting this week, or say which of the two waits and until when.",
          "concerns": "Finance"
        },
        {
          "risk": "The supplier onboarding bot has moved six weeks in a row, and every one of those weeks it was waiting on the same licence. Each week on its own looks like a small slip; the chain is the finding.",
          "action": "Ask what ships without the licence, and let the rest wait for procurement rather than the team.",
          "concerns": "Automation"
        },
        {
          "risk": "Five commitments inside Finance went quiet rather than being deferred, which is the likeliest reason the approvals above keep slipping without an explanation.",
          "action": "Ask what happened to those five before treating the delivery figure as settled."
        }
      ],
      "praise": [
        "Sade and Uche flagged the same dependency every week rather than absorbing it quietly. Their figures are protected because of it, and that is what makes them worth comparing."
      ],
      "threads": [
        {
          "headline": "Supplier onboarding bot, and the licence it needs",
          "detail": "Still moving. It has now been carried six weeks running, and each week has looked like a small slip on its own. Ifeanyi is carrying it into next week again, and it has been waiting on the same procurement approval throughout.",
          "people": ["Ifeanyi Obiora", "Sade Adeniyi"]
        },
        {
          "headline": "Q4 campaign budget and the launch flight",
          "detail": "The campaign is built and cannot start. Uche has held the paid media flight for three cycles waiting on the budget release, and said so each time before the week closed.",
          "people": ["Uche Nwankwo", "Temitope Oladele"]
        },
        {
          "headline": "Invoice ingestion and the payroll export",
          "detail": "Both landed. Rotimi and Chinaza closed the warehouse feed together; the retry and backoff work went in alongside it.",
          "people": ["Rotimi Balogun", "Chinaza Mbah"]
        },
        {
          "headline": "The employee data policy sign-off",
          "detail": "Not moved. HR has been pulled into unplanned casework for most of the period, and the onboarding bot cannot ship without the policy behind it.",
          "people": ["Folake Durojaiye", "Chinaza Mbah"]
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
         /*
          * The figures the stat block reads. COMPUTED, never written into the
          * literal above — the seed must not state a delivery rate the seeded
          * rows do not produce, and a briefing whose header disagrees with its
          * own database is worse than one with no header at all.
          *
          * Absent entirely, these read back as undefined, which is how the
          * demo emailed "undefined%".
          */
         'metrics', (
           select jsonb_build_object(
             'delivery_rate',    round(avg(dch.delivery_rate)),
             'signal_integrity', round(avg(dch.signal_integrity)),
             'people_reporting', coalesce(sum(dch.people_reporting), 0),
             'people_responded', coalesce(sum(dch.people_responded), 0)
           )
           from department_cycle_health dch
           where dch.cycle_id = cy.id
         ),
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
