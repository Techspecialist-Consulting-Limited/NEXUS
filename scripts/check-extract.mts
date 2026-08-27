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

const CASES: { name: string; text: string; expect: { commitments?: number } }[] = [
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
      openCommitments: [],
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
