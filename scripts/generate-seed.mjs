/**
 * Generates supabase/seed/seed.sql — eight weeks of history for a fictional
 * organisation.
 *
 * WHY THIS IS A FEATURE, NOT A FIXTURE
 *
 * Random demo data proves nothing. An AI that summarises noise produces
 * plausible-sounding noise, and you cannot tell whether the engine works.
 * So this seed plants five specific, humanly-recognisable stories and the
 * reconciler has to find them unaided:
 *
 *   1. chronic over-committer  one commitment that has been "next week" for
 *                              six consecutive weeks. Invisible to any tool
 *                              that only shows you the current week.
 *   2. silent dropper          abandons one commitment a week, never says so.
 *                              High delivery on what remains; low integrity.
 *   3. blocked by another team declares the dependency every time. Their
 *                              delivery rate MUST come out protected — this is
 *                              the regression test for the single most
 *                              important scoring rule in the product.
 *   4. estimation optimist     backend work consistently runs ~1.4x over.
 *                              Calibration must discover the number.
 *   5. firefighter             delivers plenty, almost none of it planned.
 *                              Exercises focus_ratio.
 *
 * Plus a model citizen for contrast — high delivery AND high integrity, who
 * defers openly when a week goes wrong.
 *
 * Dates are emitted RELATIVE to current_date, so the demo still looks like
 * this week no matter when the file is run. The PRNG is seeded, so the same
 * command always produces the same organisation and the tests stay stable.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "supabase", "seed", "seed.sql");

const WEEKS = 8; // completed weeks of history; week offset 8 is "this week"

// ---------------------------------------------------------------------------
// deterministic PRNG
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260902);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const between = (a, b) => a + rnd() * (b - a);

const q = (v) =>
  v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`;
const n = (v) =>
  v === null || v === undefined ? "null" : Number(v).toFixed(2);

// ---------------------------------------------------------------------------
// the organisation
// ---------------------------------------------------------------------------

/*
 * FOUR UNITS THAT DEPEND ON EACH OTHER.
 *
 * The point of this organisation is not that it has departments — it is that
 * the departments need things from each other, and the seed plants a single
 * bottleneck whose consequences show up in two other units' figures. An
 * executive brief that cannot join those dots is not doing its job, and with
 * five unrelated teams there were no dots to join.
 */
const DEPARTMENTS = [
  { slug: "automation", name: "Automation", color: "#2E2420",
    desc: "Process automation, integrations and internal tooling." },
  { slug: "finance", name: "Finance", color: "#4A3C36",
    desc: "Budgeting, procurement, payables and financial control." },
  { slug: "marketing", name: "Marketing", color: "#6E5E57",
    desc: "Campaigns, brand, content and demand generation." },
  { slug: "people", name: "HR", color: "#9C8A84",
    desc: "Hiring, onboarding, policy and employee relations." },
];

/*
 * WHO CARRIES WHICH STORY, AND WHY IT LANDS ON THEM.
 *
 * `blocks` names the unit somebody is waiting on, so a dependency is a
 * property of the person's situation rather than a constant buried in the
 * generator. Two different people wait on Finance, from two different units —
 * that is the finding the Chairman's brief has to surface on its own.
 *
 * The chain the data tells, if the engine is working:
 *
 *   Finance drops work silently (Segun)      -> nobody upstream knows why
 *      \-> Marketing's campaign spend stalls (Kelechi, declares it weekly)
 *      \-> Automation's licence never lands  (Chidi, declares it weekly)
 *   HR is firefighting (Bisi)                -> the policy sign-off slips
 *      \-> Automation's onboarding bot waits (Emeka)
 *   Automation's lead keeps re-promising the one thing that is blocked (Amara)
 *
 * Both blocked people declare every time, so their delivery must come out
 * PROTECTED — the single most important scoring rule in the product, and the
 * reason this seed exists rather than random data.
 */
const PEOPLE = [
  // Automation — the unit most exposed to everybody else's delays.
  { email: "ifeanyi.obiora@nexus.invalid",  name: "Ifeanyi Obiora",   dept: "automation", role: "lead",  title: "Head of Automation",   story: "over_committer" },
  { email: "sade.adeniyi@nexus.invalid",    name: "Sade Adeniyi",     dept: "automation", role: "staff", title: "Automation Engineer",  story: "blocked", blocks: "finance" },
  { email: "rotimi.balogun@nexus.invalid",  name: "Rotimi Balogun",   dept: "automation", role: "staff", title: "Integration Engineer", story: "optimist" },
  { email: "chinaza.mbah@nexus.invalid",    name: "Chinaza Mbah",     dept: "automation", role: "staff", title: "Data Engineer",        story: "blocked", blocks: "people" },

  // Finance — the bottleneck, and it does not know it is one.
  { email: "olusola.ajayi@nexus.invalid",   name: "Olusola Ajayi",    dept: "finance",    role: "lead",  title: "Head of Finance",      story: "silent_dropper" },
  { email: "grace.etim@nexus.invalid",      name: "Grace Etim",       dept: "finance",    role: "staff", title: "Financial Analyst",    story: null },

  // Marketing — waiting on Finance, and saying so every week.
  { email: "temitope.oladele@nexus.invalid", name: "Temitope Oladele", dept: "marketing", role: "lead",  title: "Head of Marketing",    story: null },
  { email: "uche.nwankwo@nexus.invalid",    name: "Uche Nwankwo",     dept: "marketing",  role: "staff", title: "Campaign Manager",     story: "blocked", blocks: "finance" },
  { email: "aisha.lawal@nexus.invalid",     name: "Aisha Lawal",      dept: "marketing",  role: "staff", title: "Content Lead",         story: "model_citizen" },

  // HR — the unit, staffed by the person who also holds the HR capability.
  { email: "folake.durojaiye@nexus.invalid", name: "Folake Durojaiye", dept: "people",    role: "hr",    title: "Head of People",       story: "firefighter" },
  { email: "kunle.oyelaran@nexus.invalid",  name: "Kunle Oyelaran",   dept: "people",     role: "staff", title: "People Operations",    story: null },

  // The Chairman — change this address to your own to receive the real digest.
  // He reads and drills in; PRD F17 makes his view read-only, so he is NOT the
  // person who administers accounts. No unit: he files nothing.
  { email: "chairman@nexus.invalid",        name: "Adebayo Fashola",  dept: null,         role: "executive", title: "Chairman",         story: null },

  // The Administrator. Somebody has to be able to invite people and place
  // them, and it is deliberately not the Chairman.
  { email: "admin@nexus.invalid",           name: "Nkechi Okafor",    dept: null,         role: "admin", title: "IT Administrator",     story: null },
];

/*
 * The work each unit actually does.
 *
 * Titles are written so a reader can tell WHY something is stuck without being
 * told: "Wait on Finance for the RPA licence" and "Release the Q4 campaign
 * budget" are two halves of one sentence, held by two different units. The
 * reconciler never reads these strings — it works from statuses and declared
 * dependencies — but a person reading the brief does, and the demo has to be
 * legible to a person.
 */
const WORK = {
  automation: {
    integration: [
      "Ship the invoice ingestion connector",
      "Wire payroll exports into the data warehouse",
      "Add retry and backoff to the webhook dispatcher",
      "Replace the nightly CSV drop with a live feed",
      "Harden the inbound email parser against malformed attachments",
    ],
    bots: [
      "Roll the supplier onboarding bot to production",
      "Automate the monthly reconciliation run",
      "Cut the statement-matching job below five minutes",
    ],
    platform: [
      "Move the scheduler onto the new deployment pipeline",
      "Set up alerting for failed overnight jobs",
      "Rotate the production service credentials",
    ],
  },
  finance: {
    control: [
      "Close the September management accounts",
      "Finish the quarterly VAT return",
      "Reconcile the supplier statements for Q3",
      "Rebuild the cash-flow forecast model",
    ],
    procurement: [
      "Approve the RPA licence renewal",
      "Release the Q4 campaign budget",
      "Settle the outstanding vendor invoices",
      "Renegotiate the payment terms with the two largest suppliers",
    ],
  },
  marketing: {
    campaign: [
      "Launch the Q4 demand campaign",
      "Ship the campaign landing page",
      "Book the paid media flight for October",
      "Run the customer story interviews",
    ],
    content: [
      "Publish the October editorial calendar",
      "Rewrite the onboarding email sequence",
      "Produce the product launch explainer",
    ],
  },
  people: {
    hiring: [
      "Close out the two open engineering offers",
      "Run the interview panel calibration session",
      "Publish the updated role scorecards",
    ],
    policy: [
      "Sign off the employee data handling policy",
      "Refresh the onboarding handbook",
      "Finish the annual leave policy update",
      "Complete the quarterly right-to-work checks",
    ],
  },
};

/*
 * A week's work for one person, WITHOUT REPLACEMENT.
 *
 * Picking a random title per slot let the same one come up two or three times
 * in a single week — nobody promises "Build the Q4 outbound sequence" three
 * times on a Monday. It looked like a rendering bug on every surface that
 * lists commitments, and it was worse than cosmetic: each duplicate counted as
 * a separate commitment, so tallies, delivery rates and the executive's unit
 * figures were all computed over work that never existed.
 *
 * Shuffling a flat pool and taking from the front guarantees distinct titles
 * per person per week, while still varying across weeks and people.
 */
/*
 * The over-committer's famous rolling commitment.
 *
 * Forced at slot 0 every week, and therefore excluded from the pool — it lives
 * in the backend list too, so a person could be handed it twice in one week:
 * once by the planted narrative and once at random.
 */
/* Slug -> the name a person would say out loud. */
const DEPT_NAME = Object.fromEntries(DEPARTMENTS.map((d) => [d.slug, d.name]));

/*
 * What each blocked person is actually waiting for.
 *
 * Written as the OTHER side of a real commitment in WORK: Chidi waits on the
 * licence Finance has to approve, Kelechi waits on the budget Finance has to
 * release, Emeka waits on the policy HR has to sign off. Read the two units'
 * boards side by side and the sentence completes itself.
 */
const BLOCKED_WORK = {
  finance: [
    "Wait on Finance to licence the RPA platform",
    "Hold the campaign flight until the Q4 budget is released",
    "Pause supplier automation pending procurement sign-off",
  ],
  people: [
    "Wait on HR to sign off the employee data handling policy",
    "Hold the onboarding bot until the data policy lands",
  ],
};

/*
 * The commitment that has been "next week" for six weeks running.
 *
 * Deliberately the automation that Finance has to licence before it can go
 * anywhere. The carry and the cross-team blocker are one story, not two:
 * Amara keeps re-promising a thing her unit cannot finish alone, and each
 * week on its own looks like a small slip.
 */
const ROLLING_TITLE = "Roll the supplier onboarding bot to production";

function weekOfWork(dept, count, exclude = []) {
  const groups = WORK[dept] ?? WORK.operations;
  const flat = Object.entries(groups)
    .flatMap(([category, titles]) => titles.map((title) => ({ category, title })))
    .filter((w) => !exclude.includes(w.title));

  // Fisher-Yates, driven by the same seeded rnd() so runs stay reproducible.
  for (let i = flat.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [flat[i], flat[j]] = [flat[j], flat[i]];
  }

  return flat.slice(0, count);
}

// ---------------------------------------------------------------------------
// build the commitment rows
// ---------------------------------------------------------------------------

const commitments = [];
const checkIns = [];
let uid = 0;

/** stable per-(person,week) natural key so carry chains can reference parents */
const key = (email, week, i) => `${email}|${week}|${i}`;

for (const person of PEOPLE) {
  /*
   * Who files a weekly check-in.
   *
   * The Chairman and the IT admin do not: PRD §5 makes the Chairman a pure
   * consumer, and a permanently unanswered check-in on his name would make
   * every compliance figure wrong for ever. HR does — they enforce the rhythm
   * and are also a member of the organisation with their own week, and being
   * the one seat exempt from it is how the whole thing reads as something done
   * TO people.
   */
  const files = person.role === "hr" || Boolean(person.dept);
  if (!files) continue;

  // The chronic over-committer's one famous rolling commitment.
  let carryFromKey = null;

  for (let week = 0; week < WEEKS; week++) {
    const story = person.story;

    // ---- how much did they take on? ------------------------------------
    let load = Math.round(between(3, 5));
    if (story === "over_committer") load = Math.round(between(6, 8));
    if (story === "model_citizen") load = Math.round(between(3, 4));

    // ---- did they even check in? ---------------------------------------
    // The silent dropper still checks in — that is what makes them hard to
    // catch. They report enthusiastically about what went well and simply
    // never mention the thing that died.
    //
    // The model citizen always checks in too, so the contrast between the two
    // is purely about *what* they disclose. Letting them randomly miss a week
    // would score them 0 for that week (correctly) and blur the fixture the
    // tests are pinned to.
    const responded =
      story === "silent_dropper" || story === "model_citizen"
        ? true
        : chance(0.93);

    const reported = [];
    const weekRows = [];

    const pool = weekOfWork(person.dept ?? "people", load, [ROLLING_TITLE]);

    /*
     * Titles already used this week.
     *
     * The pool is distinct by construction, but the planted narratives below
     * OVERRIDE the pooled title from their own short lists — and two blocked
     * items or two firefighting items in one week could draw the same one.
     * Same duplicate, same inflated counts, different cause.
     */
    const used = new Set();
    const firstUnused = (list) => list.find((t) => !used.has(t)) ?? list[0];

    for (let i = 0; i < load; i++) {
      const w = pool[i];
      let title = w.title;
      let category = w.category;
      let status = "delivered";
      let declared = false;
      let blocker = "none";
      let dependsDept = null;
      let wasPlanned = true;
      let carriedFrom = null;
      let est = Math.round(between(3, 14));
      let act = null;
      let priority = chance(0.15) ? "high" : chance(0.08) ? "critical" : "normal";

      // ------------------------------------------------------------------
      // planted narratives
      // ------------------------------------------------------------------

      if (story === "over_committer" && i === 0) {
        // The rolling commitment. Starts in week 1 and never quite lands.
        title = ROLLING_TITLE;
        category = "backend";
        priority = "high";
        if (week === 0) {
          status = "partial";
        } else if (week < WEEKS - 1) {
          status = chance(0.5) ? "partial" : "in_progress";
          carriedFrom = carryFromKey;
        } else {
          status = "delivered";
          carriedFrom = carryFromKey;
        }
        declared = chance(0.4);
        carryFromKey = key(person.email, week, i);
      } else if (story === "over_committer") {
        // Everything else suffers because of the load.
        status = pick(["delivered", "delivered", "partial", "deferred", "in_progress"]);
        declared = status !== "delivered" && chance(0.35);
      } else if (story === "silent_dropper" && i === 0) {
        status = "dropped";
        declared = false; // never mentioned — the whole point
      } else if (story === "blocked" && i < 2) {
        /*
         * Waiting on another unit, and saying so EVERY time.
         *
         * Two people carry this, in two different units, both waiting on the
         * same Finance team — which is the finding the executive brief has to
         * arrive at without being told. `blocks` comes from PEOPLE so the
         * dependency is a fact about their situation.
         *
         * `declared: true` every week is the regression test: their delivery
         * rate must come out PROTECTED. A product that penalises somebody for
         * a dependency they flagged in time teaches people to stop flagging.
         */
        status = "blocked";
        blocker = "external_team";
        dependsDept = person.blocks ?? "finance";
        declared = true; // always says so, in time
        title = firstUnused(BLOCKED_WORK[person.blocks] ?? BLOCKED_WORK.finance);
        category = person.blocks === "people" ? "bots" : "campaign";
      } else if (story === "optimist") {
        // Backend work reliably runs ~1.4x over the estimate.
        category = "backend";
        status = chance(0.75) ? "delivered" : "partial";
        est = Math.round(between(4, 12));
        act = +(est * between(1.3, 1.5)).toFixed(1);
      } else if (story === "model_citizen") {
        if (chance(0.25)) {
          status = "deferred";
          declared = true; // says so on the day it slips
        } else {
          status = "delivered";
        }
      } else if (story === "firefighter" && chance(0.55)) {
        // Delivered, but never promised: this is the unplanned-work signal.
        wasPlanned = false;
        status = "delivered";
        title = firstUnused([
          "Handle the escalated grievance case",
          "Cover the unplanned exit interview and handover",
          "Pull the headcount numbers for the board meeting",
          "Re-run payroll checks after the supplier error",
        ]);
      } else {
        // ordinary humans
        const roll = rnd();
        status =
          roll < 0.62 ? "delivered"
          : roll < 0.78 ? "partial"
          : roll < 0.88 ? "deferred"
          : roll < 0.94 ? "in_progress"
          : "dropped";
        declared = status !== "delivered" && chance(0.6);
      }

      if (act === null && (status === "delivered" || status === "partial")) {
        act = +(est * between(0.85, 1.15)).toFixed(1);
      }

      // Record it, so a later override in the same week cannot reuse it.
      used.add(title);

      // If they never checked in, nothing could have been declared.
      if (!responded) declared = false;

      /*
       * The unit named here is the one they are actually waiting on — it is
       * what `source_quote` carries, and the Chairman reads it back in
       * quotation marks under their name. A quote that names the wrong team
       * is the one thing on his screen that cannot be checked against a row.
       */
      const waitingOn = DEPT_NAME[dependsDept] ?? "another team";
      const quote =
        status === "delivered"
          ? `Finished ${title.toLowerCase()} this week.`
          : status === "blocked"
            ? `Still stuck on ${title.toLowerCase()} — waiting on ${waitingOn}.`
            : `Planning to ${title.toLowerCase()}.`;

      weekRows.push({
        uid: uid++,
        naturalKey: key(person.email, week, i),
        email: person.email,
        week,
        title,
        category,
        priority,
        status,
        declared,
        blocker,
        dependsDept,
        wasPlanned,
        carriedFrom,
        est,
        act,
        quote,
      });

      if (responded) reported.push({ title, status });
    }

    commitments.push(...weekRows);

    // ---- the check-in text ------------------------------------------------
    if (responded) {
      const done = reported.filter((r) => r.status === "delivered").map((r) => r.title);
      const stuck = reported.filter((r) => r.status === "blocked").map((r) => r.title);
      const slipped = reported
        .filter((r) => ["partial", "deferred", "in_progress"].includes(r.status))
        .map((r) => r.title);

      const parts = [];
      if (done.length) parts.push(`Shipped this week: ${done.join("; ")}.`);
      if (stuck.length) {
        const on = DEPT_NAME[person.blocks] ?? "another team";
        parts.push(`Blocked on ${stuck.join("; ")} — waiting on ${on} to sign off.`);
      }
      if (slipped.length) parts.push(`Still in flight: ${slipped.join("; ")}.`);
      if (!parts.length) parts.push("Quiet week — mostly support and interrupts.");

      checkIns.push({
        email: person.email,
        week,
        text: parts.join(" "),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// emit SQL
// ---------------------------------------------------------------------------

const deptValues = DEPARTMENTS.map(
  (d) => `(${q(d.slug)}, ${q(d.name)}, ${q(d.color)}, ${q(d.desc)})`,
).join(",\n      ");

const peopleValues = PEOPLE.map(
  (p) =>
    `(${q(p.email)}, ${q(p.name)}, ${q(p.dept)}, ${q(p.role)}, ${q(p.title)})`,
).join(",\n      ");

const checkInValues = checkIns
  .map((c) => `(${q(c.email)}, ${c.week}, ${q(c.text)})`)
  .join(",\n      ");

const commitmentValues = commitments
  .map(
    (c) =>
      `(${q(c.naturalKey)}, ${q(c.email)}, ${c.week}, ${q(c.title)}, ${q(c.category)}, ` +
      `${q(c.priority)}, ${q(c.status)}, ${c.declared}, ${q(c.blocker)}, ` +
      `${q(c.dependsDept)}, ${c.wasPlanned}, ${q(c.carriedFrom)}, ` +
      `${n(c.est)}, ${n(c.act)}, ${q(c.quote)})`,
  )
  .join(",\n      ");

const sql = `-- ============================================================================
-- NEXUS demo seed — GENERATED FILE, do not edit by hand.
--   regenerate with:  npm run db:seed:generate
--
-- ${WEEKS} weeks of history for ${PEOPLE.length} people across ${DEPARTMENTS.length} departments,
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
  -- Monday of the week ${WEEKS} weeks ago.
  v_anchor := (date_trunc('week', current_date) - interval '${WEEKS} weeks')::date;

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
      ${deptValues}
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
      ${peopleValues}
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
      ${checkInValues}
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
      ${commitmentValues};

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
`;

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, sql, "utf8");

console.log(
  `wrote ${OUT}\n  ${PEOPLE.length} people · ${DEPARTMENTS.length} departments · ` +
    `${commitments.length} commitments · ${checkIns.length} check-ins · ${WEEKS} weeks`,
);
