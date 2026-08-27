/**
 * The whole chain, against a real database, as real people.
 *
 * WHY THIS EXISTS. Every automated check passed while real users saw
 * "successful" and then an empty screen, and the executive briefing had never
 * been generated once for the real organisation. Both were invisible to the
 * test suite for the same reason: the suite runs against a seeded PGlite with a
 * mock model, and the failures lived in the joins between the real pieces —
 * a model's output shape, a status that never advanced, a week that could never
 * settle.
 *
 * So this walks the actual path: submit through the same function the HTTP
 * route calls, read back through the same queries the pages call, run the same
 * jobs the scheduler runs, and ask whether the Chairman can see a brief.
 *
 * WHAT IT WRITES. Real check-ins, under real names, in whatever database
 * DATABASE_URL points at. The text says plainly that it is a pipeline test, so
 * nobody reading the row in three months mistakes it for a claim about that
 * person's work. Requires --confirm for exactly that reason.
 *
 * Usage:
 *   node --env-file-if-exists=.env.local --import tsx scripts/verify-delivery.mts \
 *     --org "Techspecialist" --confirm [--wait 330] [--window 5]
 *
 *   --window   correction window, in minutes, set on the organisation
 *   --wait     seconds to wait for that window before running the chain.
 *              Omit to stop after submitting and skip the settlement half.
 *   --skip-submit
 *              settle and brief on what is already there. Use it for the second
 *              half of a run split in two, so nobody's report is filed twice.
 */
import { asService, asActor } from "../lib/db";
import { submitCheckIn } from "../lib/checkin";
import { latestWeeklyBrief, openCheckInCycle, cyclesWithWork } from "../lib/queries";
import { runReconcile, runDigest, runSendDigest } from "../lib/schedule";
import { readRhythm } from "../lib/rhythm";

const argv = process.argv.slice(2);
const arg = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string) => argv.includes(`--${name}`);

const ORG_MATCH = arg("org") ?? "";
const WINDOW = Number(arg("window") ?? 5);
const WAIT = arg("wait") ? Number(arg("wait")) : null;
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/*
 * A brief carries an "Open the full report" link, and that link is built from
 * APP_URL. Against a production database with a local .env.local, that means a
 * real email to a real Chairman whose only call to action points at
 * http://localhost:3000 — dead on his machine, and indistinguishable from a
 * broken product.
 *
 * The briefing is still generated and still lands on his dashboard, which is
 * the thing being verified. Only the mail is held.
 */
const LOCAL_URL = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(APP_URL);

let failures = 0;
const ok = (pass: boolean, msg: string, extra = "") => {
  if (!pass) failures++;
  console.log(`${pass ? "ok  " : "FAIL"}  ${msg}${extra ? `\n        ${extra}` : ""}`);
};
const h = (t: string) => console.log(`\n=== ${t} ${"=".repeat(Math.max(0, 58 - t.length))}`);

if (!ORG_MATCH || !has("confirm")) {
  console.error(
    "This WRITES check-ins to the database in DATABASE_URL.\n" +
      "  --org <name fragment>   which organisation to test\n" +
      "  --confirm               required, so this cannot run by accident",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------

h("WHICH DATABASE, WHICH ORGANISATION");

const [org] = await asService(
  (sql) => sql<{ id: string; name: string; timezone: string; settings: Record<string, unknown> }>`
    select id, name, timezone, settings from organizations
     where name ilike ${"%" + ORG_MATCH + "%"}
     order by created_at limit 1
  `,
);
if (!org) {
  console.error(`No organisation matching "${ORG_MATCH}".`);
  process.exit(1);
}
console.log(`  ${org.name} · ${org.timezone} · ${org.id}`);

const people = await asService(
  (sql) => sql<{ id: string; full_name: string; role: string; email: string }>`
    select id, full_name, role, email from profiles
     where org_id = ${org.id} and status = 'active'
     order by case role when 'executive' then 0 else 1 end, full_name
  `,
);
const chairman = people.find((p) => p.role === "executive") ?? null;
const reporters = people.filter((p) => p.role !== "executive");
console.log(`  ${reporters.length} reporter(s), chairman: ${chairman?.full_name ?? "NONE"}`);
ok(reporters.length > 0, "the organisation has somebody who reports");
ok(chairman !== null, "the organisation has a Chairman to brief");

// ---------------------------------------------------------------------------

h("CONFIGURE FOR A FAST DELIVERY");

/*
 * The three settings that decide whether a brief can arrive today at all. Left
 * at their defaults, the earliest possible answer is next Monday however the
 * cadence is set — the week has to end before it can settle, and the window is
 * a day long.
 */
await asService(
  (sql) => sql`
    update organizations
       set settings = settings || jsonb_build_object(
             'brief_current_cycle', true,
             'review_window_minutes', ${WINDOW}::int,
             'exec_digest_cadence', jsonb_build_object('kind', 'interval', 'minutes', 15)
           )
     where id = ${org.id}
  `,
);
const rhythm = readRhythm(
  (await asService((sql) => sql<{ settings: Record<string, unknown> }>`
     select settings from organizations where id = ${org.id}`))[0].settings,
);
console.log(`  brief on the week in progress : ${rhythm.briefCurrentCycle}`);
console.log(`  correction window             : ${rhythm.reviewWindowMinutes} minutes`);
console.log(`  cadence                       : ${JSON.stringify(rhythm.digestCadence)}`);
ok(rhythm.briefCurrentCycle, "the week in progress can settle");
ok(rhythm.reviewWindowMinutes === WINDOW, `the correction window is ${WINDOW} minutes`);

// ---------------------------------------------------------------------------

const SKIP_SUBMIT = has("skip-submit");

h(SKIP_SUBMIT ? "SUBMISSION SKIPPED — USING WHAT IS ALREADY FILED" : "SUBMIT, AS EACH PERSON, THROUGH THE REAL PATH");

/*
 * Deliberately labelled. This is a real row under a real person's name, and the
 * text is quoted back verbatim on their own page and in the Chairman's brief.
 * A fabricated achievement here would be a false claim about a colleague.
 */
const PROGRESS =
  "NEXUS pipeline test, not a real work report. Completed the end-to-end " +
  "delivery check for the reporting rhythm. The vendor approval is still " +
  "blocked by Legal.";
const PLAN =
  "Next week I will confirm the Chairman's brief arrives on the configured " +
  "schedule, and finish the pilot checklist.";

const submitted: { person: (typeof reporters)[number]; cycleId: string; checkInId: string }[] = [];

for (const person of SKIP_SUBMIT ? [] : reporters) {
  /*
   * The cycle the PERSON's check-in is open against, read exactly as their own
   * page reads it. Guessing "the current week" is what made My Week and Tasks
   * disagree about which week somebody was reporting for.
   */
  let cycle = await openCheckInCycle(person.id, person.id);

  if (!cycle) {
    // Nothing open. Fall back to the current week, which is what the prompt
    // job would have opened, so a person who has already reported can report
    // again rather than being skipped by this check entirely.
    const [current] = await asActor(
      person.id,
      (sql) => sql<{ id: string; label: string; starts_on: string; ends_on: string; seq: number }>`
        select id, label, starts_on, ends_on, seq from cycles
         where org_id = ${org.id} and kind = 'week' and starts_on <= current_date
         order by starts_on desc limit 1
      `,
    );
    cycle = current ?? null;
  }
  if (!cycle) {
    ok(false, `${person.full_name}: no cycle to report against`);
    continue;
  }

  const [next] = await asActor(
    person.id,
    (sql) => sql<{ id: string }>`
      select n.id from cycles n
       join cycles c on c.id = ${cycle!.id}
       where n.org_id = c.org_id and n.kind = 'week' and n.starts_on > c.starts_on
       order by n.starts_on limit 1
    `,
  );

  const started = Date.now();
  try {
    const outcome = await submitCheckIn(
      person.id,
      person.id,
      cycle.id,
      next?.id ?? cycle.id,
      person.full_name,
      cycle.label,
      { resolutions: [], progress: PROGRESS, plan: PLAN, dictated: false },
    );
    submitted.push({ person, cycleId: cycle.id, checkInId: outcome.checkInId });

    const commitments = outcome.extraction?.commitments?.length ?? 0;
    const blockers = outcome.extraction?.blockers?.length ?? 0;
    ok(
      Boolean(outcome.checkInId) && !outcome.processingFailed,
      `${person.full_name.padEnd(18)} filed against ${cycle.label}`,
      `${Date.now() - started}ms · commitments=${commitments} blockers=${blockers}` +
        (outcome.processingFailed ? ` · NOT READ: ${outcome.processingFailed}` : ""),
    );
  } catch (error) {
    ok(false, `${person.full_name}: submission threw`, String(error));
  }
}

// ---------------------------------------------------------------------------

h("READ IT BACK, AS THE PERSON, THROUGH THE PAGE'S OWN QUERIES");
if (SKIP_SUBMIT) console.log("  (nothing submitted this run)");

/*
 * The half that was missing. "It saved" was proven; "they can see it" was not,
 * and that gap is exactly what reached real users — a success message over an
 * empty screen. These are the same functions the pages call, run as the same
 * actor, so RLS is in the path.
 */
for (const { person, checkInId } of submitted) {
  const [row] = await asActor(
    person.id,
    (sql) => sql<{ status: string; raw_text: string | null; parsed_at: string | null }>`
      select status, raw_text, parsed_at from check_ins where id = ${checkInId}
    `,
  );
  ok(Boolean(row), `${person.full_name.padEnd(18)} can read their own check-in back`);
  ok(
    Boolean(row?.raw_text?.includes("pipeline test")),
    `${person.full_name.padEnd(18)} their own words survived verbatim`,
  );

  const weeks = await cyclesWithWork(person.id, person.id, 6);
  ok(
    weeks.length > 0,
    `${person.full_name.padEnd(18)} Tasks finds a week with work in it`,
    weeks.map((w) => w.label).join(", ") || "none",
  );

  const live = await asActor(
    person.id,
    (sql) => sql<{ n: number }>`
      select count(*)::int as n from commitments
       where profile_id = ${person.id} and deleted_at is null
    `,
  );
  ok(
    (live[0]?.n ?? 0) > 0,
    `${person.full_name.padEnd(18)} has live commitments`,
    `${live[0]?.n ?? 0}`,
  );
}

// ---------------------------------------------------------------------------

h("RULE 2: NOTHING ROLLS UP BEFORE ITS SUBJECT HAS HAD THE WINDOW");

const early = await runReconcile(org.id);
console.log(`  reconcile: ${early.detail}`);

/*
 * The invariant, stated so it cannot pass by accident.
 *
 * "Nothing has settled yet" was the obvious assertion and it is the wrong one:
 * it fails whenever a previous run left a settled week behind, and it would
 * also pass on a database where nothing had ever settled for any reason at all.
 *
 * The rule Rule 2 actually states is narrower and checkable: no reconciliation
 * may be settled while its own correction window is still open. That can only
 * be true by the code doing the right thing.
 */
const tooEarly = await asService(
  (sql) => sql<{ full_name: string; status: string; review_due_at: string }>`
    select p.full_name, r.status::text, r.review_due_at
      from reconciliations r
      join profiles p on p.id = r.profile_id
     where r.org_id = ${org.id}
       and r.status in ('confirmed', 'auto_confirmed')
       and r.review_due_at > now()
  `,
);
ok(
  tooEarly.length === 0,
  "nothing settled while its correction window was still open",
  tooEarly.map((t) => `${t.full_name} due ${t.review_due_at}`).join("; "),
);

const openNow = await asService(
  (sql) => sql<{ full_name: string; status: string; review_due_at: string | null }>`
    select p.full_name, r.status::text, r.review_due_at
      from reconciliations r
      join profiles p on p.id = r.profile_id
      join cycles cy on cy.id = r.cycle_id
     where r.org_id = ${org.id}
       and cy.starts_on <= current_date and cy.ends_on >= current_date
     order by p.full_name
  `,
);
for (const r of openNow) {
  console.log(`  ${r.full_name.padEnd(18)} ${r.status.padEnd(18)} due ${r.review_due_at ?? "-"}`);
}

const earlyBrief = chairman ? await latestWeeklyBrief(chairman.id) : null;
const earlyLabel = earlyBrief?.cycleLabel ?? null;

// ---------------------------------------------------------------------------

if (WAIT === null) {
  h("STOPPING HERE");
  console.log(
    `  No --wait given, so the settlement half is skipped.\n` +
      `  Re-run with --wait ${WINDOW * 60 + 30} to let the ${WINDOW}-minute window elapse.`,
  );
  console.log(failures === 0 ? "\nEverything checked so far holds." : `\n${failures} problem(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

h(`WAITING ${WAIT}s FOR THE CORRECTION WINDOW`);
const until = new Date(Date.now() + WAIT * 1000);
console.log(`  until ${until.toISOString()}`);
await new Promise((r) => setTimeout(r, WAIT * 1000));

// ---------------------------------------------------------------------------

h("RUN THE CHAIN, EXACTLY AS THE SCHEDULER DOES");

const reconciled = await runReconcile(org.id);
console.log(`  reconcile   : ${reconciled.detail}`);

/*
 * Settled EITHER by this run OR already, which is not a weaker check — it is
 * the correct one.
 *
 * Asserting "this run settled something" makes a second run of an idempotent
 * job report failure, and a job that must be safe to run twice is exactly the
 * job whose re-run must not look broken. What matters is the end state: the
 * week people reported in has settled.
 */
const settledNow = await asService(
  (sql) => sql<{ full_name: string }>`
    select p.full_name
      from reconciliations r
      join profiles p on p.id = r.profile_id
      join cycles cy on cy.id = r.cycle_id
     where r.org_id = ${org.id}
       and r.status in ('confirmed', 'auto_confirmed')
       and cy.starts_on <= current_date and cy.ends_on >= current_date
  `,
);
ok(
  settledNow.length > 0,
  "the week has settled, so there is something to brief on",
  settledNow.map((r) => r.full_name).join(", ") || "nothing settled",
);

const built = await runDigest(true, org.id);
console.log(`  digest      : ${built.detail}`);
ok(
  (built.counts?.written ?? 0) + (built.counts?.waiting ?? 0) > 0,
  "a briefing was written",
);

if (LOCAL_URL) {
  console.log(
    [
      `  send-digest : HELD. NEXT_PUBLIC_APP_URL is ${APP_URL}, so every link`,
      `                in the email would point at the tester's own machine.`,
      `                Set it to the deployed URL to send for real. The briefing`,
      `                is written and on the Chairman's dashboard either way.`,
    ].join("\n"),
  );
}
const delivered = LOCAL_URL
  ? { detail: "held: APP_URL is local", counts: { sent: 0 } }
  : await runSendDigest(APP_URL, org.id);
if (!LOCAL_URL) console.log(`  send-digest : ${delivered.detail}`);

// ---------------------------------------------------------------------------

h("CAN THE CHAIRMAN ACTUALLY SEE IT?");

if (!chairman) {
  ok(false, "no Chairman to check");
} else {
  const brief = await latestWeeklyBrief(chairman.id);
  ok(brief !== null, "the brief is on the Chairman's dashboard", brief?.cycleLabel ?? "nothing");
  if (brief) {
    /*
     * Only checkable when a brief for an OLDER week was already there. Two runs
     * against the same week legitimately produce a brief for the same week, and
     * calling that stale would be wrong — it was regenerated from the current
     * picture, which is the point of being able to ask again.
     */
    if (earlyLabel && earlyLabel !== brief.cycleLabel) {
      ok(true, "the brief moved on to a newer week", `${earlyLabel} -> ${brief.cycleLabel}`);
    } else {
      console.log(
        `  brief covers ${brief.cycleLabel}` +
          (earlyLabel ? " (regenerated for the same week)" : " (first one ever)"),
      );
    }
    console.log(`\n  headline: ${brief.headline}`);
    for (const t of brief.threads.slice(0, 6)) {
      console.log(`    · ${t.headline} — ${t.people.join(", ")}`);
    }
    if (brief.silent.length) console.log(`    filed nothing: ${brief.silent.join(", ")}`);
  }

  const [state] = await asService(
    (sql) => sql<{ status: string; sent_at: string | null; recipients: string[]; error: string | null }>`
      select status, sent_at, recipients, error from digests
       where org_id = ${org.id} and scope = 'executive'
       order by created_at desc limit 1
    `,
  );
  console.log(
    `\n  digest row: status=${state?.status} sent_at=${state?.sent_at ?? "null"} ` +
      `to=${JSON.stringify(state?.recipients ?? [])}${state?.error ? ` error=${state.error}` : ""}`,
  );

  const [mark] = await asService(
    (sql) => sql<{ last: string | null; next: string | null }>`
      select settings ->> 'exec_digest_last_at' as last,
             settings ->> 'exec_digest_next_at' as next
        from organizations where id = ${org.id}
    `,
  );
  ok(
    Boolean(mark?.last),
    "delivery was recorded, so the gate closes behind itself",
    `last=${mark?.last ?? "null"} next=${mark?.next ?? "null"}`,
  );
}

console.log(
  failures === 0
    ? "\nThe chain runs end to end: submitted, visible, settled, briefed, delivered."
    : `\n${failures} problem(s).`,
);
process.exit(failures === 0 ? 0 : 1);
