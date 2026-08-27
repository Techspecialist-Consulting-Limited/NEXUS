/**
 * The live extractor, against realistic reports.
 *
 * WHY THIS EXISTS. The whole test suite runs against the mock — deliberately,
 * so CI never bills a metered API (`vitest.config.mts` forces
 * NEXUS_FORCE_MOCK_AI). That is the right default and it left one gap: the
 * real model's OUTPUT SHAPE is never exercised by anything automated.
 *
 * A deployment returned `blockers` as objects rather than strings. Zod rejected
 * it, extraction threw, and because extraction ran before the insert the entire
 * submission was destroyed. It failed 8/8 on a normal weekly report and reached
 * real people, because the mock builds blockers as strings by rule and can
 * never reproduce it.
 *
 * So this checks the one thing the mock cannot: that what the deployment
 * actually returns still fits the schema — for the shapes people really write,
 * not a one-line fixture.
 *
 * Usage:
 *   node --env-file-if-exists=.env.local --import tsx scripts/check-extract.mts
 *
 * Costs a handful of fast-tier calls. Read-only: it touches no database.
 */
import { aiProvider } from "../lib/ai/provider";

type Case = {
  name: string;
  text: string;
  expect: { commitments?: number };
  /*
   * Open commitments to hand the model.
   *
   * THE GAP THIS CLOSES. Every case here used to pass [] — so the `updates`
   * branch of the schema was never exercised at all, by anything. That branch
   * is where the model returned update objects with no `status`, and commitment
   * objects shaped {person, week, text}, on roughly a quarter of responses. It
   * failed in production, under a real name, while this check reported five out
   * of five.
   *
   * A person with no open commitments is the EASY case. The hard one is the
   * ordinary one: somebody who promised three things last week and is now
   * reporting on them.
   */
  open?: { id: string; title: string }[];
};

const OPEN = [
  { id: "a", title: "Finalize the Smart Reporting System and prepare it for deployment" },
  { id: "b", title: "Continue defining the Credicorp solution, with a focus on the IT department" },
  { id: "c", title: "Work with Robinah to update and improve the TechSpecialist website" },
];

const CASES: Case[] = [
  {
    name: "achievements + a blocker + several plans (the shape that failed)",
    text:
      "Completed onboarding checklist. Vendor approval is still blocked by Legal.\n\n" +
      "Complete vendor launch. Finish API documentation. Resolve Legal approval.",
    expect: { commitments: 1 },
  },
  {
    name: "headed sections with bullets",
    text:
      "Achievements from last week\n" +
      "* Successfully presented the Credicorp prototype to the IT Department.\n" +
      "* Secured approval for updates pushed to the iOS platform.\n\n" +
      "Plans for the week\n" +
      "* Review the suggestions from the last meeting with the development team.\n" +
      "* Complete the HMIP migration following the delay caused by the NMRC team.",
    expect: { commitments: 1 },
  },
  {
    name: "prose, blocked by another team",
    text:
      "Shipped the reporting endpoint this week. The brand assets are still " +
      "waiting on Creative Hub so the app shell work has not moved.\n\n" +
      "Next week I want to start the payments spike and finish the runbook.",
    expect: { commitments: 1 },
  },
  { name: "a single terse line", text: "Finished the design tokens.", expect: {} },
  {
    name: "nothing but a blocker",
    text: "Everything is blocked on Legal. Nothing moved.",
    expect: {},
  },
  {
    name: "reporting against three open commitments (the shape that failed)",
    text:
      "Completed the end-to-end delivery check for the reporting rhythm. The " +
      "vendor approval is still blocked by Legal." +
      "\n\n" +
      "Next week I will confirm the Chairman's brief arrives on the configured " +
      "schedule, and finish the pilot checklist.",
    expect: { commitments: 1 },
    open: OPEN,
  },
  {
    name: "explicitly finishing an open commitment",
    text:
      "Finalized the Smart Reporting System and pushed it for deployment. " +
      "The Credicorp solution definition is still in progress." +
      "\n\n" +
      "Next week: hand the website work over to Robinah.",
    expect: { commitments: 1 },
    open: OPEN,
  },
];

const p = aiProvider();
if (p.name === "mock") {
  console.error(
    "This checks the LIVE model and the provider resolved to the mock.\n" +
      "Unset NEXUS_FORCE_MOCK_AI and provide the Azure variables.",
  );
  process.exit(1);
}

console.log(`provider: ${p.name} · ${p.model}\n`);
let failures = 0;

for (const c of CASES) {
  const started = Date.now();
  try {
    const { data } = await p.extract({
      text: c.text,
      openCommitments: c.open ?? [],
      personName: "Amara Okonkwo",
      cycleLabel: "W34 · 17 Aug–23 Aug",
    });

    // The shape is the point. A schema rejection here is what destroyed
    // submissions, so anything that parses at all has cleared the real bar.
    const short = data.commitments.length < (c.expect.commitments ?? 0);
    if (short) failures++;
    console.log(
      `${short ? "WARN" : "ok  "}  ${c.name}\n` +
        `        ${Date.now() - started}ms · commitments=${data.commitments.length}` +
        ` updates=${data.updates.length} blockers=${data.blockers.length}` +
        (short ? `  <-- expected at least ${c.expect.commitments}` : ""),
    );
    for (const b of data.blockers) {
      if (typeof b !== "string") {
        failures++;
        console.log(`        FAIL: blocker is not a string: ${JSON.stringify(b)}`);
      }
    }
    /*
     * An update with no status is dropped rather than defaulted, so anything
     * that survives here must carry one — and must name a commitment that
     * really exists, or the caller cannot resolve it to an id.
     */
    const titles = new Set((c.open ?? []).map((o) => o.title.toLowerCase()));
    for (const u of data.updates) {
      if (!u.status) {
        failures++;
        console.log(`        FAIL: update has no status: ${JSON.stringify(u)}`);
      }
      if (titles.size && !titles.has(u.commitment_title.toLowerCase())) {
        console.log(`        WARN: update names an unknown commitment: ${u.commitment_title}`);
      }
    }
    for (const cm of data.commitments) {
      if (!cm.source_quote || !c.text.includes(cm.source_quote.slice(0, 24))) {
        console.log(`        WARN: source_quote is not a verbatim slice: ${cm.source_quote}`);
      }
    }
  } catch (error) {
    failures++;
    // This is the failure that mattered: a submission would have been lost.
    console.log(
      `FAIL  ${c.name}\n        ${Date.now() - started}ms · ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

console.log(
  failures === 0
    ? "\nEvery shape the deployment returned fits the schema."
    : `\n${failures} problem(s). A schema rejection here means a lost submission in production.`,
);
process.exit(failures === 0 ? 0 : 1);
