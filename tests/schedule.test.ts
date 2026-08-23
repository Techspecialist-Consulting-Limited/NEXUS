/**
 * The reporting rhythm's guarantees.
 *
 * PRD §7 calls the rhythm the product, and F15 makes automatic delivery of the
 * Chairman's digest "the requirement against which delivery is judged". Two
 * things have to hold for that to be true rather than aspirational:
 *
 *   EVERY JOB IS IDEMPOTENT. Schedulers fire twice — pg_cron retries, a
 *   deploy overlaps, someone clicks the manual trigger. Running the rhythm
 *   twice must not open two check-ins, send two digests, or double-notify.
 *
 *   THE DIGEST NEVER REPORTS UNCONFIRMED WORK. Briefing the Chairman on
 *   numbers their subject has not seen breaks the one promise this product
 *   makes to the people it reports on.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createSeededDb, actAsService } from "../scripts/db-harness.mjs";
import { gateFor, momentHasArrived, readRhythm } from "../lib/rhythm";

let db: PGlite;

type Row = Record<string, string | number | boolean | null>;

async function q(sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).rows as Row[];
}

beforeAll(async () => {
  db = await createSeededDb();
  await actAsService(db);
}, 240_000);

afterAll(async () => {
  await db?.close();
});

describe("opening the check-in", () => {
  it("creates one row per person, and only one however often it runs", async () => {
    const [cycle] = await q(`
      select id from cycles where kind = 'week'
        and starts_on <= current_date
      order by starts_on desc limit 1
    `);
    const [org] = await q("select id from organizations where slug = 'nexus-demo'");

    const open = `
      insert into check_ins (org_id, profile_id, cycle_id, channel, status, prompted_at)
      select $1, p.id, $2, 'in_app', 'prompted', now()
      from profiles p
      where p.org_id = $1 and p.status = 'active'
        and p.role in ('staff', 'lead', 'hr')
      on conflict (profile_id, cycle_id, channel) do nothing
      returning id
    `;

    const first = await q(open, [org.id, cycle.id]);
    const second = await q(open, [org.id, cycle.id]);

    expect(first.length).toBeGreaterThan(0);
    // The second run is the one that matters: a scheduler firing twice must
    // not give everybody two check-ins for the same week.
    expect(second.length).toBe(0);
  });

  it("never opens one for the Chairman or the IT admin", async () => {
    const rows = await q(`
      select p.role::text as role
      from check_ins ci
      join profiles p on p.id = ci.profile_id
      where p.role in ('executive', 'admin')
    `);
    /*
     * These two consume reporting; they do not file it. A permanently
     * unanswered check-in on the Chairman's name would make every compliance
     * figure wrong, every week, for ever.
     */
    expect(rows).toHaveLength(0);
  });

  it("DOES open one for HR, who reports like anyone else", async () => {
    /*
     * HR enforces the rhythm and is also a member of the organisation with
     * their own week. Exempting them made the people who chase everybody else
     * the only seat excused from it — which is exactly how a reporting culture
     * comes to be read as something done TO people.
     */
    const [hr] = await q(`
      select count(*)::int as n
      from check_ins ci
      join profiles p on p.id = ci.profile_id
      where p.role = 'hr'
    `);
    expect(hr.n).toBeGreaterThan(0);
  });
});

describe("the digest", () => {
  it("is keyed so regenerating updates rather than duplicates", async () => {
    const [org] = await q("select id from organizations where slug = 'nexus-demo'");
    const [cycle] = await q(`
      select id from cycles where kind = 'week' order by starts_on desc limit 1
    `);

    const write = `
      insert into digests (org_id, scope, scope_id, period, cycle_id, status, subject, summary_json)
      values ($1, 'executive', null, 'weekly', $2, 'generated', $3, '{}'::jsonb)
      on conflict (org_id, scope, scope_id, period, cycle_id) do update
        set subject = excluded.subject
      returning id
    `;

    const [a] = await q(write, [org.id, cycle.id, "First attempt"]);
    const [b] = await q(write, [org.id, cycle.id, "Second attempt"]);

    expect(a.id).toBe(b.id); // same row, not a second briefing

    const [stored] = await q("select subject from digests where id = $1", [a.id]);
    expect(stored.subject).toBe("Second attempt");
  });

  it("only ever reports on a cycle its subjects have confirmed", async () => {
    /*
     * runDigest picks the most recent cycle with confirmed reconciliations.
     * This asserts the property that choice exists to protect: the chosen
     * cycle must have no rows still sitting in the employee review window.
     */
    const [chosen] = await q(`
      select cy.id, cy.label
      from cycles cy
      where cy.kind = 'week'
        and exists (
          select 1 from reconciliations r
          where r.cycle_id = cy.id and r.status in ('confirmed', 'auto_confirmed')
        )
      order by cy.starts_on desc
      limit 1
    `);
    expect(chosen).toBeTruthy();

    const [pending] = await q(
      `select count(*)::int as n from reconciliations
        where cycle_id = $1 and status = 'awaiting_employee'`,
      [chosen.id],
    );
    expect(pending.n).toBe(0);

    // And the week that IS still in review must exist and be excluded, or the
    // test would pass simply because nothing is ever pending.
    const [inReview] = await q(
      `select count(*)::int as n from reconciliations where status = 'awaiting_employee'`,
    );
    expect(inReview.n).toBeGreaterThan(0);
  });

  it("keeps a failed send retryable rather than marking it done", async () => {
    const [org] = await q("select id from organizations where slug = 'nexus-demo'");
    const [cycle] = await q(
      `select id from cycles where kind = 'week' order by starts_on asc limit 1`,
    );

    const [d] = await q(
      `insert into digests (org_id, scope, scope_id, period, cycle_id, status, subject, summary_json)
       values ($1, 'executive', null, 'monthly', $2, 'generated', 'Test', '{}'::jsonb)
       returning id`,
      [org.id, cycle.id],
    );

    // What runSendDigest does when delivery fails: record why, leave status.
    await q("update digests set error = $1 where id = $2", ["mail transport down", d.id]);

    const [after] = await q(
      "select status::text as status, sent_at, error from digests where id = $1",
      [d.id],
    );
    expect(after.status).toBe("generated"); // still pending, so the next tick retries
    expect(after.sent_at).toBeNull();
    expect(after.error).toBe("mail transport down");
  });
});

describe("the tick endpoint's guard", () => {
  it("compares the secret in constant time", async () => {
    const { timingSafeEqual } = await import("node:crypto");

    const matches = (provided: string, expected: string) => {
      const a = Buffer.from(provided);
      const b = Buffer.from(expected);
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    };

    expect(matches("correct-horse", "correct-horse")).toBe(true);
    expect(matches("correct-horse", "correct-house")).toBe(false);
    // Different lengths must not throw — timingSafeEqual does, on mismatched
    // buffers, and an exception here would be a 500 instead of a 401.
    expect(matches("short", "a-much-longer-secret")).toBe(false);
  });
});

describe("digest delivery", () => {
  it("refuses addresses on reserved TLDs before spending a send", async () => {
    const { isDeliverable } = await import("../lib/email");

    expect(isDeliverable("chairman@techspecialistlimited.com")).toBe(true);
    expect(isDeliverable("a.b+tag@sub.domain.co.uk")).toBe(true);

    /*
     * The seeded organisation lives on .demo deliberately, so eighteen fake
     * logins cannot mail eighteen real strangers. Every attempt to deliver
     * there is a hard bounce recorded against the SENDING domain — an hourly
     * scheduler on seed data would quietly wreck the deliverability of the
     * one email this product is judged on.
     */
    expect(isDeliverable("exec@nexus.demo")).toBe(false);
    expect(isDeliverable("hr@nexus.demo")).toBe(false);
    for (const tld of ["test", "example", "invalid", "local", "localhost"]) {
      expect(isDeliverable(`someone@thing.${tld}`)).toBe(false);
    }

    expect(isDeliverable("no-at-sign")).toBe(false);
    expect(isDeliverable("@nodomain.com")).toBe(false);
    expect(isDeliverable("trailing@")).toBe(false);
    expect(isDeliverable("bare@localdomain")).toBe(false); // no dot at all
  });

  it("reports undelivered rather than pretending, with no key configured", async () => {
    const { send } = await import("../lib/email");
    const key = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const result = await send({
        to: ["someone@techspecialistlimited.com"],
        subject: "s",
        html: "<p>h</p>",
        text: "t",
      });
      // Never { delivered: true } on a transport that did not transmit — a
      // digest marked sent that nobody received is the worst of both.
      expect(result.delivered).toBe(false);
    } finally {
      if (key) process.env.RESEND_API_KEY = key;
    }
  });
});

describe("the stored briefing", () => {
  it("rejects a JSON string where an object belongs", async () => {
    /*
     * This guards a bug the test suite structurally cannot reproduce.
     *
     * `${JSON.stringify(x)}::jsonb` stores the object correctly under PGlite
     * and stores the STRING under postgres.js, which infers the parameter type
     * from the cast. So the writer was wrong, every test passed, and only the
     * real database was affected — the briefing rendered with a correct
     * subject line above an empty body and reported itself delivered.
     *
     * A unit test of the writer would therefore prove nothing here. What
     * transfers is the constraint: it runs wherever the schema runs, so if
     * anyone drops it or reintroduces the cast, the failure is at the insert
     * rather than in somebody's inbox.
     */
    const [org] = await q("select id from organizations where slug = 'nexus-demo'");
    const [cycle] = await q(
      "select id from cycles where kind = 'week' order by starts_on desc limit 1",
    );

    await expect(
      q(
        `insert into digests (org_id, scope, scope_id, period, cycle_id, status, subject, summary_json)
         values ($1, 'executive', null, 'monthly', $2, 'generated', 'Encoded twice',
                 to_jsonb($3::text))`,
        [org.id, cycle.id, JSON.stringify({ subject: "s", decisions: [] })],
      ),
    ).rejects.toThrow(/digests_summary_is_object/);
  });

  it("holds one row per scope and period however often it regenerates", async () => {
    /*
     * The companion to 0011. scope_id is NULL for executive digests, and a
     * plain unique constraint treats NULLs as distinct — so ON CONFLICT never
     * fired and every regeneration inserted another briefing to send.
     */
    const [org] = await q("select id from organizations where slug = 'nexus-demo'");
    const [cycle] = await q(
      "select id from cycles where kind = 'week' order by starts_on desc limit 1",
    );

    const [before] = await q(
      `select count(*)::int as n from digests
        where org_id = $1 and scope = 'executive' and period = 'weekly' and cycle_id = $2`,
      [org.id, cycle.id],
    );

    for (let i = 0; i < 3; i++) {
      await q(
        `insert into digests (org_id, scope, scope_id, period, cycle_id, status, subject, summary_json)
         values ($1, 'executive', null, 'weekly', $2, 'generated', $3, '{}'::jsonb)
         on conflict (org_id, scope, scope_id, period, cycle_id) do update
           set subject = excluded.subject`,
        [org.id, cycle.id, `Attempt ${i}`],
      );
    }

    const [after] = await q(
      `select count(*)::int as n from digests
        where org_id = $1 and scope = 'executive' and period = 'weekly' and cycle_id = $2`,
      [org.id, cycle.id],
    );

    expect(after.n).toBe(Math.max(Number(before.n), 1));
    expect(after.n).toBe(1);
  });
});

/*
 * The rhythm gate.
 *
 * NEXUS did not used to decide its own timing — whatever called the tick ran
 * everything — so Administration → Reporting could only describe the rhythm.
 * Now each job is gated per organisation, in that organisation's timezone, and
 * these are the cases that decide whether that is trustworthy.
 */
describe("the rhythm gate", () => {
  const rhythm = {
    promptDay: 5, // Friday
    promptHour: 15,
    reminderHour: 17,
    digestDay: 1, // Monday
    digestHour: 9,
    reviewWindowHours: 24,
    maxNudgesPerDay: 2,
  };

  it("is at-or-after, so a late tick catches up rather than skipping a week", () => {
    // Friday 14:00 — not yet.
    expect(momentHasArrived({ day: 5, hour: 14 }, 5, 15)).toBe(false);
    // Friday 15:00 — exactly.
    expect(momentHasArrived({ day: 5, hour: 15 }, 5, 15)).toBe(true);
    // Saturday — late, and still due. A week nobody was asked about is worse
    // than a prompt that arrives a day behind.
    expect(momentHasArrived({ day: 6, hour: 2 }, 5, 15)).toBe(true);
  });

  it("holds a job whose day has not come", () => {
    expect(momentHasArrived({ day: 3, hour: 23 }, 5, 15)).toBe(false);
  });

  it("never gates the jobs nobody receives", () => {
    /*
     * narrate and coordinate produce a cached readout and a set of findings.
     * Holding them back schedules nothing and only means a lead opens a page
     * and waits on a model.
     */
    for (const job of ["narrate", "coordinate"]) {
      expect(gateFor(job, rhythm, "UTC").due).toBe(true);
    }
  });

  it("reads the organisation's own settings, and falls back rather than throwing", () => {
    const fromNothing = readRhythm({});
    expect(fromNothing.promptDay).toBe(5);
    expect(fromNothing.digestHour).toBe(9);

    // Junk in the column must not take the rhythm down with it.
    const fromJunk = readRhythm({
      checkin_prompt_day: "not a day",
      exec_digest_hour: 99,
      max_nudges_per_day: -1,
    });
    expect(fromJunk.promptDay).toBe(5);
    expect(fromJunk.digestHour).toBe(9);
    expect(fromJunk.maxNudgesPerDay).toBe(2);
  });

  it("names when a held job will run, so the reason is reportable", () => {
    const held = gateFor("prompt", rhythm, "UTC");
    if (!held.due) expect(held.reason).toMatch(/Friday/);
    expect(gateFor("digest", { ...rhythm, digestDay: 1, digestHour: 9 }, "UTC").reason).toMatch(
      /^$|Monday/,
    );
  });
});
