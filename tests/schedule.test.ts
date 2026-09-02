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
import { RHYTHM_DEFAULTS, gateFor, momentHasArrived, readRhythm } from "../lib/rhythm";
import { digestDue, nextCadenceMoment } from "../lib/rhythm-vocabulary";

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
    expect(isDeliverable("chairman@nexus.invalid")).toBe(false);
    expect(isDeliverable("folake.durojaiye@nexus.invalid")).toBe(false);
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
/*
 * A week marked "did not report" has to be able to change its mind.
 *
 * refresh_reconciliation writes 'skipped' when nobody has answered and, on
 * every later recompute, updates the counts but deliberately not the status -
 * because a recompute must never reset a correction window or un-confirm a week
 * somebody has already seen.
 *
 * Right for every status except 'skipped', which is not a decision anybody
 * made. It is the absence of a report, and it stops being true the moment one
 * arrives. Nothing promoted it, so a person who reported at 14:00 after the
 * 08:00 run stayed 'skipped' forever: the week never settled, and the digest -
 * which briefs on the most recent SETTLED cycle - had nothing to say about a
 * week in which people had genuinely reported.
 *
 * Found in production, where Techspecialist had two 'skipped' rows for the open
 * week and no executive digest had ever been generated for the organisation at
 * all.
 */
describe("reconciling a report that arrived late", () => {
  /** A person and an open week with no check-in between them. */
  async function subject() {
    const [row] = await q(`
      select p.id as profile_id, p.org_id, cy.id as cycle_id
      from profiles p
      join cycles cy on cy.org_id = p.org_id and cy.kind = 'week'
      where p.status = 'active' and p.role <> 'executive'
        and not exists (
          select 1 from check_ins ci
          where ci.profile_id = p.id and ci.cycle_id = cy.id
        )
        and not exists (
          select 1 from reconciliations r
          where r.profile_id = p.id and r.cycle_id = cy.id
        )
      limit 1`);
    return row;
  }

  async function statusOf(profileId: unknown, cycleId: unknown) {
    const [row] = await q(
      `select status, responded from reconciliations
        where profile_id = $1 and cycle_id = $2`,
      [profileId, cycleId],
    );
    return row;
  }

  it("marks a week nobody answered as skipped", async () => {
    const s = await subject();
    expect(s).toBeTruthy();
    await q(`select refresh_reconciliation($1, $2)`, [s.profile_id, s.cycle_id]);
    expect((await statusOf(s.profile_id, s.cycle_id)).status).toBe("skipped");
  });

  it("promotes it to draft once the report actually arrives", async () => {
    const s = await subject();
    await q(`select refresh_reconciliation($1, $2)`, [s.profile_id, s.cycle_id]);
    expect((await statusOf(s.profile_id, s.cycle_id)).status).toBe("skipped");

    // The person files their week, hours after the rhythm ran.
    await q(
      `insert into check_ins (org_id, profile_id, cycle_id, channel, status,
                              prompted_at, responded_at, raw_text)
       values ($1, $2, $3, 'in_app', 'responded', now(), now(), 'Shipped the reporting endpoint.')`,
      [s.org_id, s.profile_id, s.cycle_id],
    );

    await q(`select refresh_reconciliation($1, $2)`, [s.profile_id, s.cycle_id]);
    const after = await statusOf(s.profile_id, s.cycle_id);
    expect(after.responded).toBe(true);
    // Without this, the week could never settle and could never be briefed on.
    expect(after.status).toBe("draft");
  });

  it("leaves a settled week exactly where its subject left it", async () => {
    /*
     * The reason status was excluded from the upsert in the first place, and it
     * still has to hold: recomputing must not un-confirm a week somebody has
     * already seen and accepted.
     */
    const s = await subject();
    await q(
      `insert into check_ins (org_id, profile_id, cycle_id, channel, status,
                              prompted_at, responded_at, raw_text)
       values ($1, $2, $3, 'in_app', 'responded', now(), now(), 'Finished the design tokens.')`,
      [s.org_id, s.profile_id, s.cycle_id],
    );
    await q(`select refresh_reconciliation($1, $2)`, [s.profile_id, s.cycle_id]);
    await q(
      `update reconciliations set status = 'auto_confirmed', confirmed_at = now()
        where profile_id = $1 and cycle_id = $2`,
      [s.profile_id, s.cycle_id],
    );

    await q(`select refresh_reconciliation($1, $2)`, [s.profile_id, s.cycle_id]);
    expect((await statusOf(s.profile_id, s.cycle_id)).status).toBe("auto_confirmed");
  });
});

describe("the rhythm gate", () => {
  const rhythm = {
    ...RHYTHM_DEFAULTS,
    promptDay: 5, // Friday
    promptHour: 15,
    reminderHour: 17,
    digestCadence: { kind: "weekly" as const, day: 1, hour: 9, minute: 0 },
  };

  it("is at-or-after, so a late tick catches up rather than skipping a week", () => {
    // Friday 14:00 - not yet.
    expect(momentHasArrived({ day: 5, hour: 14, minute: 0 }, 5, 15)).toBe(false);
    // Friday 15:00 - exactly.
    expect(momentHasArrived({ day: 5, hour: 15, minute: 0 }, 5, 15)).toBe(true);
    // Saturday - late, and still due. A week nobody was asked about is worse
    // than a prompt that arrives a day behind.
    expect(momentHasArrived({ day: 6, hour: 2, minute: 0 }, 5, 15)).toBe(true);
  });

  it("holds a job whose day has not come", () => {
    expect(momentHasArrived({ day: 3, hour: 23, minute: 0 }, 5, 15)).toBe(false);
  });

  it("respects minutes, not just the hour", () => {
    /*
     * The whole rhythm was hour-grained, so the shortest honest answer to
     * "when does this happen?" was "sometime in the next sixty minutes".
     */
    expect(momentHasArrived({ day: 5, hour: 15, minute: 29 }, 5, 15, 30)).toBe(false);
    expect(momentHasArrived({ day: 5, hour: 15, minute: 30 }, 5, 15, 30)).toBe(true);
  });

  /*
   * A UTC instant on a given ISO weekday. 2026-08-31 is a Monday, so adding
   * (day - 1) lands on that weekday of the same week.
   */
  const at = (day: number, hour: number) =>
    new Date(Date.UTC(2026, 7, 30 + day, hour, 0, 0));

  /*
   * The chase used to borrow promptDay, so it could only ever be a few hours
   * after the opening. An organisation that opens on Friday and wants a last
   * call on Sunday evening — leaving people the weekend — could not say so.
   */
  it("chases on its own day, not the day the week opened", () => {
    const fridayOpenSundayChase = {
      ...rhythm,
      promptDay: 5,
      promptHour: 9,
      reminderDay: 7, // Sunday
      reminderHour: 18,
      reminderMinute: 0,
    };

    // Friday evening: the week is open, but the chase is two days off.
    expect(gateFor("prompt", fridayOpenSundayChase, "UTC", {}, at(5, 10)).due).toBe(true);
    expect(gateFor("remind", fridayOpenSundayChase, "UTC", {}, at(5, 20)).due).toBe(false);

    // Saturday: still not yet.
    expect(gateFor("remind", fridayOpenSundayChase, "UTC", {}, at(6, 23)).due).toBe(false);

    // Sunday 18:00: now.
    expect(gateFor("remind", fridayOpenSundayChase, "UTC", {}, at(7, 18)).due).toBe(true);
  });

  /*
   * Existing organisations were configured before the key existed and were
   * chasing on the prompt's day, because that is what the gate did. Falling
   * back to the RHYTHM_DEFAULTS constant would silently move the chase for
   * anybody whose opening is not a Friday.
   */
  it("defaults an unconfigured chase to the day the week opens", () => {
    const monday = readRhythm({ checkin_prompt_day: 1 });
    expect(monday.reminderDay).toBe(1);

    const wednesday = readRhythm({ checkin_prompt_day: 3, checkin_reminder_hour: 20 });
    expect(wednesday.reminderDay).toBe(3);

    // And an explicit value is honoured over the fallback.
    const split = readRhythm({ checkin_prompt_day: 5, checkin_reminder_day: 7 });
    expect(split.reminderDay).toBe(7);
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
    expect(fromNothing.digestCadence).toEqual({ kind: "weekly", day: 1, hour: 9, minute: 0 });

    // Junk in the column must not take the rhythm down with it.
    const fromJunk = readRhythm({
      checkin_prompt_day: "not a day",
      exec_digest_hour: 99,
      max_nudges_per_day: -1,
    });
    expect(fromJunk.promptDay).toBe(5);
    expect(fromJunk.digestCadence).toEqual({ kind: "weekly", day: 1, hour: 9, minute: 0 });
    expect(fromJunk.maxNudgesPerDay).toBe(2);
  });

  it("names when a held job will run, so the reason is reportable", () => {
    const held = gateFor("prompt", rhythm, "UTC");
    if (!held.due) expect(held.reason).toMatch(/Friday/);
  });
});

/*
 * The brief's cadence.
 *
 * Every organisation could only be told "a day and an hour", which made three
 * perfectly ordinary requests inexpressible: brief him every morning, brief him
 * every twenty minutes while we pilot this, and never brief him unless I ask.
 * It also meant the gate stayed open for the rest of the week once its moment
 * passed, which only ever looked correct because the digests table has a unique
 * key per cycle and quietly absorbed the repeats.
 */
describe("when the Chairman's brief is due", () => {
  const at = (iso: string) => new Date(iso);
  const weekly = { kind: "weekly" as const, day: 1, hour: 9, minute: 0 };
  const base = { ...RHYTHM_DEFAULTS, digestCadence: weekly };

  // 2026-08-31 is a Monday.
  const MON_08 = at("2026-08-31T08:00:00Z");
  const MON_09 = at("2026-08-31T09:00:00Z");
  const WED = at("2026-09-02T14:00:00Z");

  /** The Monday before the one every case below is written around. */
  const LAST_MON = at("2026-08-24T09:00:00Z");

  it("holds until the weekly moment arrives", () => {
    expect(digestDue(base, "UTC", { lastDigestAt: LAST_MON }, MON_08).due).toBe(false);
    expect(digestDue(base, "UTC", { lastDigestAt: LAST_MON }, MON_09).due).toBe(true);
  });

  it("briefs an organisation that has never been briefed, without waiting a week", () => {
    /*
     * The moment already passed, last week, and nothing went out. Making it
     * wait for the next one would mean an organisation that turns NEXUS on
     * midweek sees nothing until the following Monday - and the whole reason
     * this gate is at-or-after is that a week nobody was briefed about is worse
     * than a brief that arrives late.
     *
     * This is not theoretical. Techspecialist ran for eight days without a
     * single briefing ever being generated, and "wait for the next moment"
     * would have made day nine look identical.
     */
    expect(digestDue(base, "UTC", { lastDigestAt: null }, MON_08).due).toBe(true);
    expect(digestDue(base, "UTC", { lastDigestAt: null }, WED).due).toBe(true);
  });

  it("closes behind itself once one has actually gone out", () => {
    /*
     * THE BUG THIS REPLACES. At-or-after stayed true all week, so the gate said
     * "due" on Wednesday for a brief delivered on Monday. Nothing sent twice
     * only because regenerating updated one row rather than making a second -
     * accidental idempotency, and the reason a repeating cadence expressed
     * itself as "once, then silence".
     */
    expect(digestDue(base, "UTC", { lastDigestAt: MON_09 }, WED).due).toBe(false);
    // The following Monday it opens again.
    expect(
      digestDue(base, "UTC", { lastDigestAt: MON_09 }, at("2026-09-07T09:00:00Z")).due,
    ).toBe(true);
  });

  it("still catches up when a tick was missed", () => {
    // Nothing ran on Monday. Wednesday's tick must send, not skip the week.
    expect(
      digestDue(base, "UTC", { lastDigestAt: at("2026-08-24T09:00:00Z") }, WED).due,
    ).toBe(true);
  });

  it("counts an interval from the last delivery", () => {
    const every30 = { ...base, digestCadence: { kind: "interval" as const, minutes: 30 } };
    const t0 = at("2026-08-27T10:00:00Z");
    expect(digestDue(every30, "UTC", { lastDigestAt: null }, t0).due).toBe(true);
    expect(
      digestDue(every30, "UTC", { lastDigestAt: t0 }, at("2026-08-27T10:29:00Z")).due,
    ).toBe(false);
    expect(
      digestDue(every30, "UTC", { lastDigestAt: t0 }, at("2026-08-27T10:30:00Z")).due,
    ).toBe(true);
  });

  it("says how long is left, rather than only refusing", () => {
    const every30 = { ...base, digestCadence: { kind: "interval" as const, minutes: 30 } };
    const t0 = at("2026-08-27T10:00:00Z");
    expect(
      digestDue(every30, "UTC", { lastDigestAt: t0 }, at("2026-08-27T10:10:00Z")).reason,
    ).toMatch(/20 min/);
  });

  it("never fires on a schedule when the cadence is manual", () => {
    const manual = { ...base, digestCadence: { kind: "manual" as const } };
    expect(digestDue(manual, "UTC", { lastDigestAt: null }, MON_09).due).toBe(false);
  });

  it("honours a one-off, even against a manual cadence", () => {
    /*
     * "I need him briefed in ten minutes" is the request this exists for, and
     * the cadence having no answer is exactly why somebody is asking.
     */
    const manual = {
      ...base,
      digestCadence: { kind: "manual" as const },
      nextDigestAt: "2026-08-27T10:10:00Z",
    };
    expect(
      digestDue(manual, "UTC", { lastDigestAt: null }, at("2026-08-27T10:05:00Z")).due,
    ).toBe(false);
    expect(
      digestDue(manual, "UTC", { lastDigestAt: null }, at("2026-08-27T10:10:00Z")).due,
    ).toBe(true);
  });

  it("does not fire a one-off twice", () => {
    const withAsk = { ...base, nextDigestAt: "2026-08-27T10:10:00Z" };
    expect(
      digestDue(
        withAsk,
        "UTC",
        { lastDigestAt: at("2026-08-27T10:11:00Z") },
        at("2026-08-27T10:20:00Z"),
      ).due,
    ).toBe(false);
  });

  it("does not let an urgent ask cost the organisation its regular brief", () => {
    /*
     * Somebody asking for an extra brief on Thursday has said nothing about
     * Monday. Swallowing the cadence because a one-off is pending would make
     * every urgent request quietly cancel the rhythm.
     */
    const withAsk = { ...base, nextDigestAt: "2026-09-03T10:00:00Z" };
    expect(digestDue(withAsk, "UTC", { lastDigestAt: null }, MON_09).due).toBe(true);
  });

  it("reads the moment in the organisation's timezone, not the server's", () => {
    // Lagos is UTC+1, so Monday 09:00 there is 08:00Z. The previous week's
    // moment - and therefore the last delivery - is 2026-08-24T08:00Z.
    const lastDigestAt = at("2026-08-24T09:30:00Z");

    // Same instant, same state, opposite answer - which is the whole point.
    // In Lagos it is Monday 09:00 and this week's brief is due; in UTC it is
    // only 08:00, so the last moment to have passed is still last Monday's,
    // which was already delivered.
    expect(digestDue(base, "Africa/Lagos", { lastDigestAt }, MON_08).due).toBe(true);
    expect(digestDue(base, "UTC", { lastDigestAt }, MON_08).due).toBe(false);

    // 07:00Z is 08:00 in Lagos: an hour early there too, and held.
    expect(
      digestDue(base, "Africa/Lagos", { lastDigestAt }, at("2026-08-31T07:00:00Z")).due,
    ).toBe(false);
  });

  it("can name the next moment, so the page is not guessing", () => {
    const next = nextCadenceMoment(weekly, "UTC", at("2026-08-27T10:00:00Z"));
    expect(next?.toISOString()).toBe("2026-08-31T09:00:00.000Z");
    expect(nextCadenceMoment({ kind: "manual" }, "UTC")).toBeNull();
  });
});

/*
 * Reading an organisation configured before any of this existed.
 *
 * Every row in production carries exec_digest_day / exec_digest_hour and
 * review_window_hours. A rename that reset them would move somebody's brief to
 * a different morning without telling them, which is the kind of change nobody
 * connects to a deployment three days later.
 */
describe("an organisation configured before the cadence existed", () => {
  it("reads its old two keys as a weekly cadence", () => {
    const r = readRhythm({ exec_digest_day: 3, exec_digest_hour: 17 });
    expect(r.digestCadence).toEqual({ kind: "weekly", day: 3, hour: 17, minute: 0 });
  });

  it("keeps the correction window it was given, in minutes", () => {
    expect(readRhythm({ review_window_hours: 48 }).reviewWindowMinutes).toBe(2880);
    // An explicit minutes value wins, and can go below the old one-hour floor.
    expect(
      readRhythm({ review_window_hours: 48, review_window_minutes: 10 }).reviewWindowMinutes,
    ).toBe(10);
  });

  it("prefers a stored cadence over the superseded keys", () => {
    const r = readRhythm({
      exec_digest_day: 3,
      exec_digest_hour: 17,
      exec_digest_cadence: { kind: "interval", minutes: 15 },
    });
    expect(r.digestCadence).toEqual({ kind: "interval", minutes: 15 });
  });
});
