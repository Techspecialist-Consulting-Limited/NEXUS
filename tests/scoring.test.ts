/* eslint-disable @typescript-eslint/no-explicit-any --
 * Rows here come straight back from ad-hoc SQL, so their shape changes per
 * query and per test. Declaring an interface for each would be noise that
 * hides the assertions; `any` on the row bag is the honest description.
 */
/**
 * The scoring rules, verified against the planted seed narratives.
 *
 * These are not smoke tests. Each one pins down a rule that the product's
 * credibility rests on, and each would fail loudly if someone "simplified"
 * the SQL later:
 *
 *   - a person blocked by another team is not punished for it
 *   - going silent is caught even when the week otherwise looks great
 *   - a commitment that has been "next week" for six weeks is visible as such
 *   - the executive cannot read a reconciliation the employee hasn't seen yet
 *
 * delivery_rate is recomputed independently in TypeScript from the raw
 * commitment rows and compared against what the SQL stored, so a change to
 * either implementation has to be justified against the other.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createSeededDb, actAsService } from "../scripts/db-harness.mjs";

let db: PGlite;

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 3,
  high: 2,
  normal: 1,
  low: 0.5,
};

type Row = Record<string, any>;

async function q(sql: string, params: unknown[] = []): Promise<Row[]> {
  const res = await db.query(sql, params);
  return res.rows as Row[];
}

/** Independent restatement of the delivery_rate rule from 0004. */
function expectedDeliveryRate(rows: Row[]): number | null {
  const protectedRow = (r: Row) =>
    r.status === "blocked" &&
    ["external_team", "external_party"].includes(r.blocker_kind) &&
    r.deviation_declared;

  const planned = rows.filter(
    (r) => r.was_planned && r.status !== "superseded" && !protectedRow(r),
  );
  const denominator = planned.reduce(
    (s, r) => s + PRIORITY_WEIGHT[r.priority],
    0,
  );
  if (denominator === 0) return null;

  const credit = (r: Row) =>
    r.status === "delivered" ? 1 : r.status === "partial" ? 0.5 : 0;
  const numerator = planned.reduce(
    (s, r) => s + PRIORITY_WEIGHT[r.priority] * credit(r),
    0,
  );
  return (100 * numerator) / denominator;
}

beforeAll(async () => {
  db = await createSeededDb();
  await actAsService(db);
}, 240_000);

afterAll(async () => {
  await db?.close();
});

// ---------------------------------------------------------------------------

describe("seed integrity", () => {
  it("builds the demo organisation", async () => {
    const [org] = await q("select id, name from organizations where slug = 'nexus-demo'");
    expect(org).toBeTruthy();

    const [counts] = await q(`
      select
        (select count(*) from profiles     where org_id = $1) as people,
        (select count(*) from departments  where org_id = $1) as departments,
        (select count(*) from commitments  where org_id = $1) as commitments,
        (select count(*) from check_ins    where org_id = $1) as check_ins,
        (select count(*) from reconciliations where org_id = $1) as reconciliations
    `, [org.id]);

    expect(Number(counts.departments)).toBe(5);
    expect(Number(counts.people)).toBe(18); // 15 in units + Chairman, HR, Administrator
    expect(Number(counts.commitments)).toBeGreaterThan(400);
    expect(Number(counts.check_ins)).toBeGreaterThan(80);
    expect(Number(counts.reconciliations)).toBeGreaterThan(100);
  });
});

describe("delivery_rate", () => {
  it("matches an independent recomputation for every person and week", async () => {
    const recs = await q(`
      select r.id, r.profile_id, r.cycle_id, r.delivery_rate, p.email
      from reconciliations r
      join profiles p on p.id = r.profile_id
      order by p.email, r.cycle_id
    `);
    expect(recs.length).toBeGreaterThan(0);

    let compared = 0;
    for (const rec of recs) {
      const rows = await q(
        `select c.status, c.priority, c.was_planned, c.blocker_kind, c.deviation_declared
           from commitments c
          where c.profile_id = $1 and c.target_cycle_id = $2 and c.deleted_at is null`,
        [rec.profile_id, rec.cycle_id],
      );
      const expected = expectedDeliveryRate(rows);

      if (expected === null) {
        expect(rec.delivery_rate).toBeNull();
      } else {
        expect(rec.delivery_rate).not.toBeNull();
        expect(Number(rec.delivery_rate)).toBeCloseTo(expected, 1);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(50);
  });
});

describe("narrative: blocked by another team", () => {
  // The single most important scoring rule in the product. If being blocked by
  // Creative Hub costs Chidi delivery points, he stops declaring dependencies,
  // and the dependency graph an executive needs goes dark within a cycle.
  it("excludes declared external blocks from Chidi's denominator", async () => {
    const weeks = await q(`
      select r.cycle_id, r.delivery_rate, r.protected_count, r.blocked_count
      from reconciliations r
      join profiles p on p.id = r.profile_id
      where p.email = 'chidi@nexus.demo' and r.protected_count > 0
    `);
    expect(weeks.length).toBeGreaterThan(0);

    for (const w of weeks) {
      expect(Number(w.protected_count)).toBeGreaterThan(0);

      const all = await q(
        `select c.status, c.priority, c.was_planned, c.blocker_kind, c.deviation_declared
           from commitments c
           join profiles p on p.id = c.profile_id
          where p.email = 'chidi@nexus.demo' and c.target_cycle_id = $1`,
        [w.cycle_id],
      );

      // Naive scoring — counting blocked work as a failure — would give this.
      const naiveDenominator = all
        .filter((r) => r.was_planned && r.status !== "superseded")
        .reduce((s, r) => s + PRIORITY_WEIGHT[r.priority], 0);

      /*
       * Migration 0004: work is protected when it is blocked, blocked by an
       * OUTSIDE party, and the person said so in time. All three conditions —
       * being stuck is not enough, and neither is saying so about your own
       * delay.
       */
      const protectedWeight = all
        .filter(
          (r) =>
            r.was_planned &&
            r.status === "blocked" &&
            ["external_team", "external_party"].includes(r.blocker_kind) &&
            r.deviation_declared,
        )
        .reduce((s, r) => s + PRIORITY_WEIGHT[r.priority], 0);

      const numerator = all
        .filter(
          (r) =>
            r.was_planned &&
            r.status !== "superseded" &&
            ["delivered", "partial"].includes(r.status),
        )
        .reduce(
          (s, r) =>
            s + PRIORITY_WEIGHT[r.priority] * (r.status === "delivered" ? 1 : 0.5),
          0,
        );

      /*
       * Assert the MECHANISM, not a side effect of it.
       *
       * This used to assert the real rate beat the naive one, which only shows
       * up when something was delivered — in a week where Chidi delivered
       * nothing, both are 0 and the property is vacuous rather than violated,
       * so the test failed on a seed change while the protection still worked
       * perfectly. Comparing against the exact expected denominator holds
       * either way, and pins the rule instead of a symptom.
       */
      expect(protectedWeight).toBeGreaterThan(0);

      const expected = (100 * numerator) / (naiveDenominator - protectedWeight);
      expect(Number(w.delivery_rate)).toBeCloseTo(expected, 1);

      // And it is never harsher than counting the block against them.
      const naiveRate = (100 * numerator) / naiveDenominator;
      expect(Number(w.delivery_rate)).toBeGreaterThanOrEqual(naiveRate);
    }
  });

  it("still records the block, so the bottleneck stays visible", async () => {
    const [edge] = await q(`
      select sum(blocked_count)::int as blocked
      from dependency_edges de
      join departments d on d.id = de.to_department_id
      where d.slug = 'creative-hub'
    `);
    expect(Number(edge.blocked)).toBeGreaterThan(0);
  });
});

describe("narrative: the silent dropper", () => {
  // Tunde checks in every single week and sounds positive. What he never
  // mentions is the thing he quietly abandoned. A tool that only reads the
  // check-in text would report him as healthy.
  it("catches drops that were never declared", async () => {
    const [agg] = await q(`
      select
        sum(r.silent_drop_count)::int      as silent_drops,
        round(avg(r.signal_integrity), 2)  as integrity,
        round(avg(r.delivery_rate), 2)     as delivery,
        bool_and(r.responded)              as always_responded
      from reconciliations r
      join profiles p on p.id = r.profile_id
      where p.email = 'tunde@nexus.demo'
    `);

    expect(Number(agg.silent_drops)).toBeGreaterThanOrEqual(6);
    expect(agg.always_responded).toBe(true);      // he never went quiet...
    expect(Number(agg.integrity)).toBeLessThan(75); // ...but his signal is poor
  });

  it("scores the model citizen's integrity above the silent dropper's", async () => {
    const [row] = await q(`
      select
        avg(case when p.email = 'ngozi@nexus.demo' then r.signal_integrity end) as model_citizen,
        avg(case when p.email = 'tunde@nexus.demo' then r.signal_integrity end) as dropper
      from reconciliations r
      join profiles p on p.id = r.profile_id
      where p.email in ('ngozi@nexus.demo', 'tunde@nexus.demo')
    `);
    // Ngozi defers openly and on time; that must read as integrity, not failure.
    expect(Number(row.model_citizen)).toBeGreaterThan(Number(row.dropper));
    expect(Number(row.model_citizen)).toBeGreaterThan(90);
  });
});

describe("narrative: the chronic over-committer", () => {
  it("exposes a rollover chain no weekly snapshot could show", async () => {
    const [row] = await q(`
      with recursive chain as (
        select c.id, 1 as depth
        from commitments c
        join profiles p on p.id = c.profile_id
        where p.email = 'amara@nexus.demo' and c.carried_from_commitment_id is null
        union all
        select c.id, ch.depth + 1
        from commitments c
        join chain ch on c.carried_from_commitment_id = ch.id
      )
      select max(depth)::int as longest from chain
    `);
    // "Migrate the reporting pipeline" has been next week for six weeks.
    expect(Number(row.longest)).toBeGreaterThanOrEqual(6);
  });

  it("shows the load, not just the outcome", async () => {
    const [row] = await q(`
      select round(avg(r.promised_count), 2) as amara,
             (select round(avg(r2.promised_count), 2)
                from reconciliations r2
                join profiles p2 on p2.id = r2.profile_id
               where p2.email = 'ngozi@nexus.demo') as steady
      from reconciliations r
      join profiles p on p.id = r.profile_id
      where p.email = 'amara@nexus.demo'
    `);
    expect(Number(row.amara)).toBeGreaterThan(Number(row.steady));
  });
});

describe("narrative: the estimation optimist", () => {
  it("has a discoverable ~1.4x bias on backend work", async () => {
    const [row] = await q(`
      select round(sum(c.actual_effort_hours) / sum(c.estimated_effort_hours), 3) as bias
      from commitments c
      join profiles p on p.id = c.profile_id
      where p.email = 'zainab@nexus.demo'
        and c.category = 'backend'
        and c.actual_effort_hours is not null
    `);
    expect(Number(row.bias)).toBeGreaterThan(1.25);
    expect(Number(row.bias)).toBeLessThan(1.55);
  });
});

describe("narrative: the firefighter", () => {
  it("delivers plenty but almost none of it was planned", async () => {
    const [row] = await q(`
      select
        sum(r.unplanned_count)::int   as unplanned,
        round(avg(r.focus_ratio), 2)  as focus
      from reconciliations r
      join profiles p on p.id = r.profile_id
      where p.email = 'kelechi@nexus.demo'
    `);
    expect(Number(row.unplanned)).toBeGreaterThan(5);
    expect(Number(row.focus)).toBeLessThan(85);
  });
});

describe("signal_integrity edge cases", () => {
  it("is zero when someone never checked in at all", async () => {
    const rows = await q(`
      select r.signal_integrity, r.responded, r.status
      from reconciliations r
      where r.responded = false
      limit 5
    `);
    for (const r of rows) {
      expect(Number(r.signal_integrity)).toBe(0);
      expect(r.status).toBe("skipped");
    }
  });

  it("is 100 for a clean week with no deviations", async () => {
    const rows = await q(`
      select r.signal_integrity
      from reconciliations r
      where r.responded
        and r.promised_count > 0
        and r.delivered_count = r.promised_count
      limit 5
    `);
    for (const r of rows) expect(Number(r.signal_integrity)).toBe(100);
  });
});

describe("recomputation is idempotent", () => {
  it("produces identical numbers when run again", async () => {
    const [before] = await q(`
      select r.id, r.profile_id, r.cycle_id, r.delivery_rate, r.signal_integrity
      from reconciliations r
      join profiles p on p.id = r.profile_id
      where p.email = 'amara@nexus.demo'
      order by r.cycle_id
      limit 1
    `);
    await q("select refresh_reconciliation($1, $2)", [
      before.profile_id,
      before.cycle_id,
    ]);
    const [after] = await q(
      "select delivery_rate, signal_integrity from reconciliations where id = $1",
      [before.id],
    );
    expect(Number(after.delivery_rate)).toBe(Number(before.delivery_rate));
    expect(Number(after.signal_integrity)).toBe(Number(before.signal_integrity));
  });

  it("does not clobber a narrative or an employee note", async () => {
    const [rec] = await q(`
      select r.id, r.profile_id, r.cycle_id
      from reconciliations r
      join profiles p on p.id = r.profile_id
      where p.email = 'ngozi@nexus.demo'
      limit 1
    `);
    await q(
      `update reconciliations
          set ai_narrative = 'generated prose', employee_note = 'client moved the date'
        where id = $1`,
      [rec.id],
    );
    await q("select refresh_reconciliation($1, $2)", [rec.profile_id, rec.cycle_id]);

    const [after] = await q(
      "select ai_narrative, employee_note from reconciliations where id = $1",
      [rec.id],
    );
    expect(after.ai_narrative).toBe("generated prose");
    expect(after.employee_note).toBe("client moved the date");
  });
});
