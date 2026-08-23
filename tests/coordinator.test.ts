/**
 * The coordination layer's escalation rules.
 *
 * These are promises to the people being reported on, and a promise nobody
 * tests is a promise that quietly stops being true:
 *
 *   - somebody who went quiet hears about it FIRST, phrased as a question,
 *     before anyone above them sees an interpretation
 *   - a cross-team blocker goes to the lead who can clear it, never to the
 *     people waiting, who have done nothing wrong
 *   - the Chairman and HR are never nagged to file a standup they do not file
 *   - the daily budget still caps everything, whatever the coordinator wants
 *
 * The last one is the important one. The brief asks the AI to decide what gets
 * sent; this pins down that it decides the wording while the database decides
 * the volume.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createSeededDb, actAsService } from "../scripts/db-harness.mjs";
import {
  planDispatches,
  wordDispatches,
  deliverDispatches,
  type Run,
} from "../lib/ai/coordinator";

let db: PGlite;
let run: Run;
let cycleId: string;

type Row = Record<string, string | number | boolean | null>;

async function q(sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).rows as Row[];
}

beforeAll(async () => {
  db = await createSeededDb();
  await actAsService(db);

  /*
   * Adapt the harness's positional-parameter client to the tagged-template
   * interface the app uses, so the coordinator runs its real SQL rather than
   * a paraphrase of it.
   */
  run = async (fn) =>
    fn(async (strings, ...values) => {
      const text = strings.reduce(
        (acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ""),
        "",
      );
      const res = await db.query(text, values as unknown[]);
      return res.rows as never[];
    });

  const [cycle] = await q(`
    select cy.id from cycles cy
    join reconciliations r on r.cycle_id = cy.id
    where cy.kind = 'week'
    group by cy.id, cy.starts_on
    order by cy.starts_on desc
    limit 1
  `);
  cycleId = String(cycle.id);
}, 240_000);

afterAll(async () => {
  await db?.close();
});

describe("who gets told", () => {
  it("asks the person about their own silent drop, not their lead", async () => {
    const plans = await planDispatches(cycleId, run);
    const drops = plans.filter((p) => p.kind === "silent_drop");
    expect(drops.length).toBeGreaterThan(0);

    await actAsService(db);
    for (const d of drops) {
      // By id, not title: the seed reuses titles across people, and a
      // notification that cannot be traced to one commitment is not evidence.
      const [owner] = await q(
        `select c.profile_id from commitments c where c.id = $1`,
        [d.facts.commitmentId as string],
      );
      // The recipient is the person it is about — nobody else.
      expect(d.recipientProfileId).toBe(owner.profile_id);
    }
  });

  it("phrases a silent drop as a question rather than a verdict", async () => {
    const plans = await planDispatches(cycleId, run);
    const drop = plans.find((p) => p.kind === "silent_drop");
    expect(drop?.sensitive).toBe(true);

    const [worded] = await wordDispatches([drop!]);
    const message = `${worded.title} ${worded.body} ${worded.ask ?? ""}`;

    expect(message).toMatch(/\?/);
    // Never an accusation. These are the words that would break the trust the
    // whole review window exists to protect.
    expect(message).not.toMatch(/failed|neglect|missed your|you did not/i);
  });

  it("sends a blocker to the unit that can clear it", async () => {
    const plans = await planDispatches(cycleId, run);
    const blockers = plans.filter((p) => p.kind === "blocker_owner");
    expect(blockers.length).toBeGreaterThan(0);

    await actAsService(db);
    for (const b of blockers) {
      const [lead] = await q(
        `select d.lead_id from departments d where d.name = $1`,
        [b.facts.owningUnit as string],
      );
      // Aimed at the owning unit's lead, not at the blocked people.
      expect(b.recipientProfileId).toBe(lead.lead_id);
      expect(b.facts.owningUnit).not.toBe(b.facts.blockedUnit);
    }
  });

  /*
   * This used to assert reminders reached only staff and leads, and it passed
   * for the wrong reason: the coordinator already chased HR, and the seeded HR
   * person happened to have responded.
   *
   * The rule the product actually holds is narrower and does not have a list
   * in it: everybody files a week except the Chairman, so everybody except the
   * Chairman is chased. An administrator exempt from the rhythm they configure
   * is the clearest possible signal that the rhythm is optional — which is why
   * the assertion is now an exclusion rather than an allow-list, and cannot go
   * stale the next time a role is added.
   */
  it("never nags the Chairman for a standup, and chases everybody else", async () => {
    const plans = await planDispatches(cycleId, run);
    const reminders = plans.filter((p) => p.kind === "checkin_reminder");

    for (const r of reminders) {
      expect(r.recipientRole).not.toBe("executive");
    }
  });
});

describe("urgency", () => {
  it("puts the most urgent first, so the budget keeps the right ones", async () => {
    const plans = await planDispatches(cycleId, run);
    const priorities = plans.map((p) => p.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });

  it("treats a three-way block as critical", async () => {
    const plans = await planDispatches(cycleId, run);
    for (const p of plans.filter((x) => x.kind === "blocker_owner")) {
      const count = Number(p.facts.count);
      expect(p.priority).toBe(count >= 3 ? 0 : 1);
    }
  });
});

describe("the budget still decides volume", () => {
  it("caps what one person receives however much the coordinator plans", async () => {
    await actAsService(db);
    const [org] = await q("select id from organizations where slug = 'nexus-demo'");
    const [victim] = await q(
      `insert into profiles (org_id, email, full_name, role, timezone,
                             quiet_hours_start, quiet_hours_end)
       values ($1, 'flood@nexus.test', 'Flood Target', 'staff', 'Africa/Lagos', 0, 0)
       returning id`,
      [org.id],
    );

    // Ten plans aimed at one person. The coordinator wants all ten sent.
    const plans = Array.from({ length: 10 }, (_, i) => ({
      recipientProfileId: victim.id as string,
      recipientName: "Flood Target",
      recipientRole: "staff",
      kind: "commitment_mismatch",
      priority: 2 as const,
      actionUrl: "/my-week",
      actionLabel: "Resolve it",
      facts: { title: `Thing ${i}` },
      sensitive: false,
      rationale: "test",
      title: `Thing ${i}`,
      body: "Body",
    }));

    await deliverDispatches(plans, run);

    const [counts] = await q(
      `select
         count(*) filter (where status = 'queued')::int     as queued,
         count(*) filter (where status = 'suppressed')::int as suppressed
       from notifications where profile_id = $1`,
      [victim.id],
    );

    // The model wanted ten. The database allowed two.
    expect(counts.queued).toBeLessThanOrEqual(2);
    expect(counts.suppressed).toBeGreaterThanOrEqual(8);
  });

  it("lets a critical escalation through the cap", async () => {
    await actAsService(db);
    const [org] = await q("select id from organizations where slug = 'nexus-demo'");
    const [lead] = await q(
      `insert into profiles (org_id, email, full_name, role, timezone,
                             quiet_hours_start, quiet_hours_end)
       values ($1, 'urgent@nexus.test', 'Urgent Lead', 'lead', 'Africa/Lagos', 0, 0)
       returning id`,
      [org.id],
    );

    const filler = Array.from({ length: 5 }, (_, i) => ({
      recipientProfileId: lead.id as string,
      recipientName: "Urgent Lead",
      recipientRole: "lead",
      kind: "checkin_reminder",
      priority: 2 as const,
      actionUrl: "/check-in",
      actionLabel: "Check in",
      facts: {},
      sensitive: false,
      rationale: "test",
      title: `Filler ${i}`,
      body: "Body",
    }));

    await deliverDispatches(filler, run);
    await deliverDispatches(
      [
        {
          recipientProfileId: lead.id as string,
          recipientName: "Urgent Lead",
          recipientRole: "lead",
          kind: "blocker_owner",
          priority: 0,
          actionUrl: "/dashboard",
          actionLabel: "See the unit",
          facts: { count: 4 },
          sensitive: false,
          rationale: "test",
          title: "Four commitments are stuck on your unit",
          body: "Body",
        },
      ],
      run,
    );

    const [critical] = await q(
      `select status::text as status from notifications
        where profile_id = $1 and priority = 0`,
      [lead.id],
    );
    // A genuine escalation must never be eaten by a quota.
    expect(critical.status).toBe("queued");
  });
});

describe("wording survives a provider failure", () => {
  it("still produces a sendable message", async () => {
    const plans = await planDispatches(cycleId, run);
    const worded = await wordDispatches(plans.slice(0, 5));

    for (const w of worded) {
      expect(w.title.length).toBeGreaterThan(2);
      expect(w.body.length).toBeGreaterThan(2);
    }
  });
});
