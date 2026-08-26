import { asService } from "./db";
import { gateFor, readRhythm } from "./rhythm";
import { planDispatches, wordDispatches, deliverDispatches } from "./ai/coordinator";
import { generateDigest, renderDigestEmail } from "./ai/executive-digest";
import { weeklyBrief } from "./coach";
import { send, isDeliverable, mailRedirect } from "./email";

/*
 * The reporting rhythm.
 *
 * PRD §7: "The rhythm is the product." Everything else exists to sustain it —
 * a fixed submission day, a prompt nobody has to remember, reminders only to
 * the people who have not answered, a deadline that flags rather than blocks,
 * and a digest that reaches the Chairman without anyone compiling it.
 *
 * PRD F15 is blunt about which part is judged: automatic delivery of that
 * digest is "the requirement against which delivery is judged". A digest that
 * needs somebody to run a command has not met it.
 *
 * EVERY JOB HERE IS IDEMPOTENT, and not by convention — by construction:
 *
 *   prompts and reminders  go through enqueue_notification, whose daily budget
 *                          and per-cycle uniqueness mean a double fire cannot
 *                          double-send.
 *   digests                have a unique key on (org, scope, period, cycle),
 *                          so regenerating updates one row rather than making
 *                          a second.
 *   sending                checks sent_at before dispatching, so a scheduler
 *                          that retries does not email the Chairman twice.
 *
 * That matters because every scheduler in existence occasionally fires twice,
 * and "we sent it once" is not something to leave to the scheduler's promises.
 */

export type JobName =
  | "prompt"
  | "remind"
  | "reconcile"
  | "narrate"
  | "coordinate"
  | "digest"
  | "send-digest";

export type JobResult = {
  job: JobName;
  ok: boolean;
  /** What actually happened, in words a log reader can act on. */
  detail: string;
  counts?: Record<string, number>;
};

/**
 * The cycle currently being reported on, per organisation — filtered by
 * whether this job's configured moment has arrived for that organisation.
 *
 * THE GATE LIVES HERE because this is the only place a job knows which
 * organisation it is about to act on. Gating at the tick would have to be
 * all-or-nothing across every tenant, and two organisations in different
 * timezones would then share one schedule.
 *
 * `force` skips it. That is the manual run — an administrator asking for the
 * digest now means now, and a control that silently declined because it was
 * Tuesday would be the worst button in the product.
 */
async function currentCycles(job?: JobName, force = false) {
  const rows = await asService(
    (sql) => sql<{
      org_id: string;
      org_name: string;
      timezone: string;
      settings: Record<string, unknown>;
      cycle_id: string;
      cycle_label: string;
      ends_on: string;
    }>`
      select o.id as org_id, o.name as org_name, o.timezone, o.settings,
             cy.id as cycle_id, cy.label as cycle_label, cy.ends_on
      from organizations o
      join lateral (
        select cy.id, cy.label, cy.ends_on
        from cycles cy
        where cy.org_id = o.id
          and cy.kind = 'week'
          and cy.starts_on <= current_date
        order by cy.starts_on desc
        limit 1
      ) cy on true
    `,
  );

  if (!job || force) return rows;
  return rows.filter((r) => gateFor(job, readRhythm(r.settings), r.timezone).due);
}

/**
 * Open the check-in for everyone who files one.
 *
 * Creates the check_in row in 'prompted' state and notifies. The row is what
 * makes "did not report" answerable later — without it, silence and "never
 * asked" are indistinguishable, and blaming somebody for a prompt that was
 * never sent is the fastest way to lose a reporting culture.
 */
export async function runPrompt(force = false): Promise<JobResult> {
  const cycles = await currentCycles("prompt", force);
  let created = 0;

  for (const c of cycles) {
    const rows = await asService(
      (sql) => sql<{ id: string }>`
        insert into check_ins (org_id, profile_id, cycle_id, channel, status, prompted_at)
        select ${c.org_id}, p.id, ${c.cycle_id}, 'in_app', 'prompted', now()
        from profiles p
        where p.org_id = ${c.org_id}
          and p.status = 'active'
          /*
           * HR files a check-in too. They are a consumer of reporting AND a
           * member of the organisation with their own week — excluding them
           * meant the people enforcing the rhythm were the only ones exempt
           * from it, which is the fastest way for a reporting culture to be
           * read as something done TO people rather than by them.
           *
           * The Administrator was added for the same reason HR was: they are a
           * staff member with extra capability, not a separate kind of user,
           * and an admin exempt from the rhythm they configure is the clearest
           * possible signal that the rhythm is optional.
           *
           * Only the Chairman is out: PRD §5 makes him a pure consumer, and a
           * permanently unanswered check-in on his name would make every
           * compliance figure wrong.
           */
          and p.role <> 'executive'
        on conflict (profile_id, cycle_id, channel) do nothing
        returning id
      `,
    );
    created += rows.length;
  }

  return {
    job: "prompt",
    ok: true,
    detail:
      created === 0
        ? "Every check-in for the current cycle was already open."
        : `Opened ${created} check-ins.`,
    counts: { created, organisations: cycles.length },
  };
}

/**
 * Chase only the people who have not answered.
 *
 * PRD F3: reminders go to non-submitters, and anyone who has submitted
 * receives nothing further. A reminder to somebody who already reported is how
 * a system teaches people to ignore it.
 */
export async function runRemind(force = false): Promise<JobResult> {
  const cycles = await currentCycles("remind", force);
  let queued = 0;
  let suppressed = 0;

  for (const c of cycles) {
    const plans = await planDispatches(c.cycle_id);
    const reminders = plans.filter((p) => p.kind === "checkin_reminder");
    if (reminders.length === 0) continue;

    const worded = await wordDispatches(reminders);
    const result = await deliverDispatches(worded);
    queued += result.queued;
    suppressed += result.suppressed;
  }

  return {
    job: "remind",
    ok: true,
    detail:
      queued === 0
        ? "Nobody needed chasing."
        : `Reminded ${queued} people; ${suppressed} held by the notification budget.`,
    counts: { queued, suppressed },
  };
}

/**
 * Turn what people reported into a reconciled week.
 *
 * THIS WAS THE MISSING LINK. `refresh_reconciliation()` has existed since
 * migration 0004 and nothing in the application ever called it — it appeared
 * only in the seed, in tests, and in a comment. Nothing advanced a row through
 * `draft -> awaiting_employee -> auto_confirmed` either. So on a real
 * deployment: check-ins were filed, commitments were extracted, and then the
 * chain stopped. No cycle ever became settled, `narrate` found nothing to
 * write, and `runDigest` answered "No settled cycle to brief on yet" forever.
 * The Chairman would never have received a briefing, whatever the schedule
 * said.
 *
 * Ungated, like narrate and coordinate: this computes, it does not notify.
 * Holding arithmetic back until a configured hour only means somebody opens
 * their own week and finds it empty.
 *
 * All three steps are idempotent, which they have to be — the tick fires
 * hourly and retries.
 */
export async function runReconcile(): Promise<JobResult> {
  /*
   * 1. Recompute. The last three weeks rather than only the current one, so a
   *    late submission or a corrected commitment is picked up rather than
   *    frozen at whatever the first run saw.
   *
   *    On conflict the function updates the COUNTS and leaves status,
   *    review_due_at, ai_narrative and employee_note alone, so recomputing
   *    can neither restart somebody's correction window nor discard what they
   *    or the model wrote.
   */
  const computed = await asService(
    (sql) => sql<{ id: string }>`
      select refresh_reconciliation(p.id, cy.id) as id
      from profiles p
      join cycles cy
        on cy.org_id = p.org_id
       and cy.kind = 'week'
      where p.status = 'active'
        -- The Chairman files nothing, so there is nothing of his to reconcile.
        and p.role <> 'executive'
        and cy.starts_on <= current_date
        and cy.starts_on > current_date - interval '21 days'
    `,
  );

  /*
   * 2. Open the correction window on weeks that have ENDED.
   *
   * review_due_at is reset here rather than trusted from the insert. The row
   * is first written mid-week, so its original due time is mid-week too —
   * left alone, a week could auto-confirm before it had even finished. The
   * window has to start when the person is actually asked to look.
   */
  const opened = await asService(
    (sql) => sql<{ id: string }>`
      update reconciliations r
         set status = 'awaiting_employee',
             review_due_at = now() + make_interval(
               hours => coalesce((o.settings ->> 'review_window_hours')::integer, 24)
             )
        from cycles cy, organizations o
       where cy.id = r.cycle_id
         and o.id = r.org_id
         and r.status = 'draft'
         and cy.ends_on < current_date
      returning r.id
    `,
  );

  /*
   * 3. Auto-confirm once the window has elapsed.
   *
   * Rule 2 in one statement: nothing reaches a lead or the Chairman until its
   * subject has had the chance to correct it. Silence for the full window
   * counts as acceptance — 'auto_confirmed' records that it was silence
   * rather than agreement, which is a distinction worth keeping.
   */
  const settled = await asService(
    (sql) => sql<{ id: string }>`
      update reconciliations
         set status = 'auto_confirmed',
             confirmed_at = now()
       where status = 'awaiting_employee'
         and review_due_at is not null
         and review_due_at <= now()
      returning id
    `,
  );

  const parts = [`recomputed ${computed.length}`];
  if (opened.length) parts.push(`opened ${opened.length} for review`);
  if (settled.length) parts.push(`settled ${settled.length}`);

  return {
    job: "reconcile",
    ok: true,
    detail: parts.join(", ") + ".",
    counts: {
      recomputed: computed.length,
      opened: opened.length,
      settled: settled.length,
    },
  };
}

/**
 * Write the weekly readout for anybody whose week has settled without one.
 *
 * The narrative is generated once and stored on the reconciliation, and the
 * employee's home page reads it. Generating it on first view meant whoever
 * opened the page first waited around thirty seconds for a model — on the
 * screen the PRD calls the highest-priority in the product, and on the exact
 * morning people are most likely to look.
 *
 * So the rhythm warms it. By the time anybody arrives the prose is already
 * there, and the page is a database read.
 *
 * Bounded per tick on purpose: a first run against a long history would
 * otherwise fire hundreds of paid calls in one request and time out. Whatever
 * is left is picked up next tick.
 */
export async function runNarrate(): Promise<JobResult> {
  const pending = await asService(
    (sql) => sql<{
      profile_id: string;
      cycle_id: string;
      full_name: string;
      label: string;
    }>`
      select r.profile_id, r.cycle_id, p.full_name, cy.label
      from reconciliations r
      join profiles p on p.id = r.profile_id
      join cycles cy on cy.id = r.cycle_id
      where r.ai_narrative is null
        and r.status in ('confirmed', 'auto_confirmed')
        and p.status = 'active'
      order by cy.starts_on desc
      limit 12
    `,
  );

  if (pending.length === 0) {
    return { job: "narrate", ok: true, detail: "Every settled week already has its readout." };
  }

  let written = 0;
  const problems: string[] = [];

  for (const row of pending) {
    try {
      /*
       * As the person, not as the service role. weeklyBrief writes the cache
       * through their own policies, so this job cannot become a way to store a
       * narrative on a row its subject could not write themselves.
       */
      await weeklyBrief(row.profile_id, row.profile_id, row.cycle_id, row.full_name, row.label);
      written++;
    } catch (error) {
      problems.push(error instanceof Error ? error.message : "unknown");
    }
  }

  return {
    job: "narrate",
    ok: problems.length === 0,
    detail:
      problems.length === 0
        ? `Wrote ${written} weekly ${written === 1 ? "readout" : "readouts"}.`
        : `Wrote ${written}; ${problems.length} failed — ${problems[0]}`,
    counts: { written, failed: problems.length },
  };
}

/**
 * Everything else the coordinator noticed: silent drops, open commitments,
 * cross-team blockers. Runs after the deadline, so it reasons about a settled
 * picture rather than a half-filled one.
 */
export async function runCoordinate(): Promise<JobResult> {
  /*
   * Never gated. Findings are invisible until somebody opens a page that shows
   * them, so holding them back schedules nothing and only means a lead waits.
   * The notifications they produce are gated where it matters — by the daily
   * budget and by quiet hours, in enqueue_notification.
   */
  const cycles = await currentCycles();
  let queued = 0;
  let suppressed = 0;

  for (const c of cycles) {
    const plans = await planDispatches(c.cycle_id);
    // Reminders are runRemind's job; this pass is about findings.
    const findings = plans.filter((p) => p.kind !== "checkin_reminder");
    if (findings.length === 0) continue;

    const worded = await wordDispatches(findings);
    const result = await deliverDispatches(worded);
    queued += result.queued;
    suppressed += result.suppressed;
  }

  return {
    job: "coordinate",
    ok: true,
    detail:
      queued === 0
        ? "Nothing needed raising."
        : `Raised ${queued} items; ${suppressed} held by the notification budget.`,
    counts: { queued, suppressed },
  };
}

/**
 * Write the executive briefing for the most recent SETTLED cycle.
 *
 * Deliberately not the current one. A digest of a week whose reconciliations
 * are still inside the employee review window would brief the Chairman on
 * numbers their subjects have not seen — which is the one promise this product
 * makes to the people it reports on.
 */
export async function runDigest(force = false): Promise<JobResult> {
  /*
   * Gated per organisation, like the prompt. The digest is the one thing here
   * that lands in somebody's inbox on a schedule they were told about, so
   * "Monday 9am" has to mean Monday 9am rather than whenever the tick ran.
   */
  if (!force) {
    const due = await currentCycles("digest", false);
    if (due.length === 0) {
      return {
        job: "digest",
        ok: true,
        detail: "Not yet due for any organisation.",
      };
    }
  }

  const settled = await asService(
    (sql) => sql<{ cycle_id: string; label: string }>`
      select cy.id as cycle_id, cy.label
      from cycles cy
      where cy.kind = 'week'
        and exists (
          select 1 from reconciliations r
          where r.cycle_id = cy.id
            and r.status in ('confirmed', 'auto_confirmed')
        )
      order by cy.starts_on desc
      limit 1
    `,
  );

  if (settled.length === 0) {
    return { job: "digest", ok: true, detail: "No settled cycle to brief on yet." };
  }

  const built = await generateDigest(settled[0].cycle_id, "weekly");
  return built
    ? {
        job: "digest",
        ok: true,
        detail: `Wrote the briefing for ${built.cycleLabel}: "${built.result.subject}"`,
        counts: { decisions: built.result.decisions.length },
      }
    : { job: "digest", ok: true, detail: "No organisation has a Chairman to brief." };
}

/**
 * Deliver any generated-but-unsent briefing.
 *
 * Split from writing it on purpose. Generation is slow and can fail on a model
 * hiccup; delivery is fast and must not be coupled to that. It also means a
 * failed send retries without paying to regenerate the same briefing.
 */
export async function runSendDigest(appUrl: string): Promise<JobResult> {
  const pending = await asService(
    (sql) => sql<{
      id: string;
      cycle_id: string;
      subject: string;
      summary_json: Record<string, unknown>;
      org_name: string;
      cycle_label: string;
    }>`
      select d.id, d.cycle_id, d.subject, d.summary_json,
             o.name as org_name, cy.label as cycle_label
      from digests d
      join organizations o on o.id = d.org_id
      join cycles cy on cy.id = d.cycle_id
      where d.scope = 'executive'
        and d.status = 'generated'
        and d.sent_at is null
      order by d.created_at desc
      limit 5
    `,
  );

  if (pending.length === 0) {
    return { job: "send-digest", ok: true, detail: "Nothing waiting to be sent." };
  }

  let sent = 0;
  const problems: string[] = [];

  for (const digest of pending) {
    /*
     * The Chairman and HR. PRD §5: the Chairman is the primary consumer, HR
     * the secondary consumer and enforcement partner — both take their view
     * from the email without signing in.
     */
    const recipients = await asService(
      (sql) => sql<{ email: string }>`
        select p.email
        from profiles p
        join digests d on d.org_id = p.org_id
        where d.id = ${digest.id}
          and p.status = 'active'
          and p.role in ('executive', 'hr')
      `,
    );

    if (recipients.length === 0) {
      problems.push("no Chairman or HR to send to");
      continue;
    }

    const summary = digest.summary_json as {
      subject: string;
      headline: string;
      whatChanged: string[];
      decisions: { risk: string; action: string; concerns?: string }[];
      praise: string[];
      /** Optional: briefings written before threads existed do not carry it. */
      threads?: { headline: string; detail: string; people: string[] }[];
      /** Counted at generation time, not written by the model. */
      silent?: string[];
      metrics: Record<string, unknown>;
    };

    /*
     * Never deliver an empty briefing.
     *
     * The renderer tolerates missing fields so a schema change cannot take
     * delivery down — but tolerance at the edge means a briefing with nothing
     * in it renders cleanly and reports as sent. That happened: a double
     * encoded summary_json read back as undefined on every field, and the
     * Chairman received a correct subject line above a blank page.
     *
     * So the check lives here, where there is still a choice. An empty
     * briefing is a generation failure, not a delivery one: leave it pending,
     * name the reason, and let the next tick regenerate it. Sending nothing is
     * strictly worse than sending late, because nobody goes looking for a
     * briefing they believe they already read.
     */
    const isEmpty =
      !summary ||
      typeof summary !== "object" ||
      (!summary.headline &&
        (summary.whatChanged?.length ?? 0) === 0 &&
        (summary.decisions?.length ?? 0) === 0);

    if (isEmpty) {
      await asService(
        (sql) => sql`
          update digests
             set error = 'Briefing had no content; not sent. Will regenerate.'
           where id = ${digest.id}
        `,
      );
      problems.push(`${digest.org_name}: briefing had no content`);
      continue;
    }

    const rendered = renderDigestEmail(
      {
        cycleId: digest.cycle_id,
        cycleLabel: digest.cycle_label,
        orgName: digest.org_name,
        /*
         * `threads` postdates the briefings already in the table, and
         * summary_json is read by whatever build is running rather than the
         * one that wrote it. Defaulting here keeps an older briefing sendable
         * instead of failing its delivery on a field it could not have had.
         */
        result: { ...summary, threads: summary.threads ?? [] },
        metrics: summary.metrics ?? {},
        silent: summary.silent ?? [],
        model: "stored",
      },
      appUrl,
    );

    /*
     * One send per recipient, not one send to a joined list.
     *
     * Two reasons, both learned the hard way. Resend takes a list and rejects
     * a comma-joined string outright — so the briefing failed to send at all.
     * And a single send to several people fails as a unit: one stale HR
     * address would take the Chairman's briefing down with it, which inverts
     * the priority. Separate sends also mean neither recipient sees the
     * other's address in a To: header.
     */
    const addresses = recipients.map((r) => r.email);
    /*
     * With a redirect configured, nothing is unroutable — the transport is
     * going to divert it to one inbox regardless, and skipping here would make
     * the seeded organisation's briefing impossible to ever look at.
     */
    const redirecting = mailRedirect() !== null;
    const routable = redirecting ? addresses : addresses.filter(isDeliverable);
    const skipped = recipients.length - routable.length;

    if (routable.length === 0) {
      /*
       * The seeded organisation lives on a reserved TLD, so this is the
       * expected path on demo data and must not be treated as an error worth
       * retrying every hour. Marked sent-with-a-note: it will never succeed,
       * and leaving it pending would keep it at the head of the queue forever.
       */
      await asService(
        (sql) => sql`
          update digests
             set status = 'sent', sent_at = now(), recipients = '{}',
                 error = ${"No routable recipient address (" + addresses.join(", ") + ")"}
           where id = ${digest.id}
        `,
      );
      problems.push(`no routable address for ${digest.org_name}`);
      continue;
    }

    const delivered: string[] = [];
    if (redirecting) {
      // One message naming everyone it was for, rather than N copies of the
      // same briefing landing in the same test inbox.
      const result = await send({ to: routable, ...rendered });
      if (result.delivered) delivered.push(...routable);
      else problems.push(result.reason);
    } else {
      for (const address of routable) {
        const result = await send({ to: address, ...rendered });
        if (result.delivered) delivered.push(address);
        else problems.push(`${address}: ${result.reason}`);
      }
    }

    if (delivered.length > 0) {
      await asService(
        (sql) => sql`
          update digests
             set status = 'sent', sent_at = now(), recipients = ${delivered},
                 error = ${skipped > 0 ? `${skipped} recipient(s) had unroutable addresses` : null}
           where id = ${digest.id}
        `,
      );
      sent += delivered.length;
    } else {
      /*
       * Record the reason and leave status alone, so the next tick retries.
       * A digest that silently failed and marked itself done is worse than one
       * that never generated: the Chairman has no reason to go looking.
       */
      await asService(
        (sql) => sql`update digests set error = ${problems.at(-1) ?? "send failed"} where id = ${digest.id}`,
      );
    }
  }

  return {
    job: "send-digest",
    ok: problems.length === 0,
    detail:
      problems.length === 0
        ? `Delivered to ${sent} ${sent === 1 ? "recipient" : "recipients"}.`
        : `Delivered to ${sent}; ${problems.length} failed — ${problems[0]}`,
    counts: { sent, failed: problems.length },
  };
}

/**
 * Run one job.
 *
 * `force` is what an explicitly named job means: the caller asked for this one
 * thing, so the organisation's schedule does not get a vote. The unnamed run —
 * the scheduler ticking through the whole rhythm — is gated.
 *
 * `send-digest` is not gated, because `digest` is: with nothing generated there
 * is nothing to send, and gating both would mean a digest generated late could
 * never go out until the following week.
 */
export async function runJob(
  job: JobName,
  appUrl: string,
  force = false,
): Promise<JobResult> {
  switch (job) {
    case "prompt":
      return runPrompt(force);
    case "remind":
      return runRemind(force);
    case "reconcile":
      return runReconcile();
    case "narrate":
      return runNarrate();
    case "coordinate":
      return runCoordinate();
    case "digest":
      return runDigest(force);
    case "send-digest":
      return runSendDigest(appUrl);
  }
}
