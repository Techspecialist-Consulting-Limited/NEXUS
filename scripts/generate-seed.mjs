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
const rnd = mulberry32(20260818);
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

const DEPARTMENTS = [
  { slug: "techspecialist", name: "Techspecialist", color: "#5B8CFF",
    desc: "Platform engineering, integrations and internal tooling." },
  { slug: "media-hub", name: "Media Hub", color: "#F2789F",
    desc: "Production, editorial and channel distribution." },
  { slug: "creative-hub", name: "Creative Hub", color: "#F5B942",
    desc: "Brand, design systems and campaign creative." },
  { slug: "operations", name: "Operations", color: "#48C9A9",
    desc: "Delivery management, vendors and client onboarding." },
  { slug: "growth", name: "Growth", color: "#B18CF5",
    desc: "Partnerships, pipeline and revenue programmes." },
];

// narrative: which planted story, if any, this person carries
const PEOPLE = [
  // Techspecialist
  { email: "amara@nexus.demo",    name: "Amara Okonkwo",   dept: "techspecialist", role: "lead",  title: "Head of Engineering",     story: "over_committer" },
  { email: "chidi@nexus.demo",    name: "Chidi Nwosu",     dept: "techspecialist", role: "staff", title: "Senior Engineer",         story: "blocked" },
  { email: "zainab@nexus.demo",   name: "Zainab Yusuf",    dept: "techspecialist", role: "staff", title: "Backend Engineer",        story: "optimist" },
  { email: "emeka@nexus.demo",    name: "Emeka Obi",       dept: "techspecialist", role: "staff", title: "Data Engineer",           story: null },
  { email: "fatima@nexus.demo",   name: "Fatima Bello",    dept: "techspecialist", role: "staff", title: "QA Engineer",             story: null },

  // Media Hub
  { email: "tunde@nexus.demo",    name: "Tunde Balogun",   dept: "media-hub",      role: "lead",  title: "Head of Media",           story: "silent_dropper" },
  { email: "ngozi@nexus.demo",    name: "Ngozi Eze",       dept: "media-hub",      role: "staff", title: "Producer",                story: "model_citizen" },
  { email: "yusuf@nexus.demo",    name: "Yusuf Ibrahim",   dept: "media-hub",      role: "staff", title: "Video Editor",            story: null },

  // Creative Hub
  { email: "adaeze@nexus.demo",   name: "Adaeze Nnamdi",   dept: "creative-hub",   role: "lead",  title: "Creative Director",       story: null },
  { email: "kelechi@nexus.demo",  name: "Kelechi Anyanwu", dept: "creative-hub",   role: "staff", title: "Designer",                story: "firefighter" },
  { email: "halima@nexus.demo",   name: "Halima Sani",     dept: "creative-hub",   role: "staff", title: "Copywriter",              story: null },

  // Operations
  { email: "segun@nexus.demo",    name: "Segun Adeyemi",   dept: "operations",     role: "lead",  title: "Head of Operations",      story: null },
  { email: "blessing@nexus.demo", name: "Blessing Okoro",  dept: "operations",     role: "staff", title: "Delivery Manager",        story: null },

  // Growth
  { email: "ifeoma@nexus.demo",   name: "Ifeoma Chukwu",   dept: "growth",         role: "lead",  title: "Head of Growth",          story: null },
  { email: "musa@nexus.demo",     name: "Musa Danjuma",    dept: "growth",         role: "staff", title: "Partnerships Lead",       story: null },

  // The Chairman — change this address to your own to receive the real digest.
  // He reads and drills in; PRD F17 makes his view read-only, so he is NOT the
  // person who administers accounts.
  { email: "exec@nexus.demo",     name: "Damilola Ogunlesi", dept: null,            role: "executive", title: "Chairman",            story: null },

  // HR: the enforcement partner. Sees the whole organisation and who reported,
  // and still cannot read anybody's raw check-in text.
  { email: "hr@nexus.demo",       name: "Bisi Adewale",    dept: null,             role: "hr",    title: "Head of People",          story: null },

  // The Administrator. Somebody has to be able to invite people and place
  // them, and it is deliberately not the Chairman.
  { email: "admin@nexus.demo",    name: "Tolu Adebayo",    dept: null,             role: "admin", title: "IT Administrator",        story: null },
];

const WORK = {
  techspecialist: {
    backend: [
      "Ship the commitment reconciliation endpoint",
      "Migrate the reporting pipeline to the new warehouse",
      "Add retry + backoff to the webhook dispatcher",
      "Cut API p95 latency below 300ms",
      "Move session storage off the primary database",
      "Harden the inbound email parser against malformed MIME",
    ],
    frontend: [
      "Rebuild the department drill-down view",
      "Fix layout shift on the dashboard header",
      "Add keyboard navigation to the commitment list",
    ],
    infra: [
      "Roll staging onto the new deployment pipeline",
      "Set up alerting for failed background jobs",
      "Rotate the production credentials",
    ],
  },
  "media-hub": {
    production: [
      "Cut the Q3 client showreel",
      "Record and edit three founder interviews",
      "Deliver the campaign launch film",
      "Rebuild the podcast publishing checklist",
    ],
    editorial: [
      "Publish the September editorial calendar",
      "Draft five channel scripts for the product launch",
      "Close out captions and subtitles for the archive",
    ],
  },
  "creative-hub": {
    design: [
      "Deliver the rebrand key visuals",
      "Finish the design token documentation",
      "Produce campaign assets for the launch",
      "Refresh the pitch deck template",
    ],
    copy: [
      "Write the landing page copy",
      "Rewrite onboarding email sequence",
      "Name and position the new service line",
    ],
  },
  operations: {
    delivery: [
      "Close out the Q3 vendor reconciliation",
      "Onboard two new client accounts",
      "Rewrite the delivery handover checklist",
    ],
    process: [
      "Run the quarterly access review",
      "Document the escalation path for late deliverables",
    ],
  },
  /*
   * HR reports too, so HR needs work to report on.
   *
   * They sit outside the delivery units, so this is deliberately the work of
   * running the organisation rather than a department's output — but it is
   * real weekly work, and it goes through exactly the same reconciliation as
   * everybody else's.
   */
  people: {
    hiring: [
      "Close out the two open engineering offers",
      "Run the interview panel calibration session",
      "Publish the updated role scorecards",
    ],
    policy: [
      "Refresh the onboarding handbook",
      "Finish the annual leave policy update",
      "Complete the quarterly right-to-work checks",
    ],
  },
  growth: {
    pipeline: [
      "Qualify the inbound partnership pipeline",
      "Close the two outstanding renewal conversations",
      "Build the Q4 outbound sequence",
    ],
    partnerships: [
      "Sign the distribution partnership",
      "Run the partner enablement session",
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
const ROLLING_TITLE = "Migrate the reporting pipeline to the new warehouse";

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
        status = "blocked";
        blocker = "external_team";
        dependsDept = "creative-hub";
        declared = true; // always says so, in time
        title = firstUnused([
          "Integrate the new brand assets into the app shell",
          "Ship the campaign landing page",
          "Wire up the redesigned dashboard components",
        ]);
        category = "frontend";
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
          "Emergency asset resize for the client pitch",
          "Unplanned rework after the brand feedback session",
          "Last-minute deck for the board meeting",
          "Fix the broken export in the campaign template",
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

      const quote =
        status === "delivered"
          ? `Finished ${title.toLowerCase()} this week.`
          : status === "blocked"
            ? `Still stuck on ${title.toLowerCase()} — waiting on Creative Hub.`
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
      if (stuck.length) parts.push(`Blocked on ${stuck.join("; ")} — waiting on Creative Hub to sign off.`);
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
      ]
    }'::jsonb,
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
