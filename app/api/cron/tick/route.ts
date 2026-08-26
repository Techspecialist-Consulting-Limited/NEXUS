import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runJob, type JobName } from "@/lib/schedule";

/*
 * The one endpoint a scheduler calls.
 *
 * Deliberately transport-agnostic: Supabase pg_cron via pg_net, Vercel Cron, a
 * GitHub Action, or Windows Task Scheduler all just make an HTTP request. That
 * matters because the PRD needs this running before anyone has decided where
 * NEXUS is hosted, and a scheduler tied to one platform is a decision made
 * early for no reason.
 *
 * Every job is idempotent, so a scheduler that fires twice — and they all do,
 * eventually — cannot double-send.
 */

const JOBS: JobName[] = [
  "prompt",
  "remind",
  /*
   * Order matters from here down, and it is a dependency chain rather than a
   * preference.
   *
   * `reconcile` turns what people reported into a settled week. Everything
   * after it reads what it produces: `narrate` writes a readout per settled
   * reconciliation, and `digest` briefs on the most recent settled cycle. Run
   * it later and each tick would work from the previous hour's picture.
   */
  "reconcile",
  // Before the digest: warm the weekly readouts so nobody opens their home
  // page and waits thirty seconds for a model to write one.
  "narrate",
  "coordinate",
  "digest",
  "send-digest",
];

/**
 * Compare the secret without leaking its length or contents through timing.
 *
 * A plain === on a secret returns faster the earlier it differs, which is
 * enough to recover it one character at a time given enough attempts. This is
 * a public endpoint whose whole protection is that string.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;

  /*
   * No secret configured means no scheduled jobs, not open access. Refusing is
   * the only safe reading: this endpoint emails the Chairman and notifies the
   * whole organisation.
   */
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on this server." },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "");
  if (!provided || !secretMatches(provided, expected)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const url = new URL(request.url);
  const requested = url.searchParams.get("job");

  const jobs: JobName[] = requested
    ? JOBS.filter((j) => j === requested)
    : // No job named: run the whole rhythm in order. Prompts before reminders,
      // findings before the digest that reports on them.
      JOBS;

  if (jobs.length === 0) {
    return NextResponse.json(
      { error: `Unknown job. Expected one of: ${JOBS.join(", ")}` },
      { status: 400 },
    );
  }

  /*
   * Trailing slashes stripped. Every consumer builds links as `${appUrl}/path`,
   * and the value pasted into a dashboard usually ends in "/" because that is
   * what a browser address bar shows. That produced "https://host//dashboard",
   * which survives only because Vercel happens to 308 it back — an extra hop
   * on the one link in the Chairman's briefing, resting on a normalisation
   * nobody chose.
   */
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? url.origin).replace(/\/+$/, "");
  const results = [];

  /*
   * A NAMED job is a manual run and ignores the organisation's schedule.
   *
   * `?job=digest` means "send it now". The unnamed run — a scheduler ticking
   * through the whole rhythm, sensibly hourly — is gated per organisation
   * against the times set on Administration → Reporting, so "Monday 9am"
   * means Monday 9am rather than whenever the tick happened to fire.
   *
   * Every job is idempotent, so ticking hourly costs nothing: the gate simply
   * turns the tick into "run when due" without a run ledger or a lock.
   */
  const manual = Boolean(requested);

  for (const job of jobs) {
    try {
      results.push(await runJob(job, appUrl, manual));
    } catch (err) {
      /*
       * One failing job must not abandon the rest. A model timeout during the
       * digest should never stop the reminders that keep the rhythm alive.
       */
      results.push({
        job,
        ok: false,
        detail: err instanceof Error ? err.message : "Unknown failure.",
      });
    }
  }

  const failed = results.filter((r) => !r.ok);
  return NextResponse.json(
    { ranAt: new Date().toISOString(), results },
    { status: failed.length ? 207 : 200 },
  );
}

/** A GET is almost always a browser or a misconfigured scheduler. Say so. */
export async function GET() {
  return NextResponse.json(
    {
      error: "Use POST with an Authorization: Bearer <CRON_SECRET> header.",
      jobs: JOBS,
    },
    { status: 405 },
  );
}
