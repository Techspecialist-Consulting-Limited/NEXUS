/* eslint-disable @typescript-eslint/no-explicit-any --
 * Rows here come straight back from ad-hoc SQL, so their shape changes per
 * query and per test. Declaring an interface for each would be noise that
 * hides the assertions; `any` on the row bag is the honest description.
 */
/**
 * Row Level Security — the trust model, verified from the seat of a real
 * unprivileged user.
 *
 * The promises this suite exists to keep honest:
 *
 *   "Your manager cannot read your reconciliation until you have seen it."
 *   "Nobody reads the raw words you typed except you."
 *
 * Those are the two things that decide whether people write the truth in a
 * check-in or write for an audience. If they are only enforced in a React
 * component, the first server-side report anyone writes quietly breaks them.
 * So they are enforced as row filters, and asserted here.
 *
 * Note these tests run as the `authenticated` role. Run as the default
 * superuser they would all pass regardless of the policies, because
 * superusers bypass RLS entirely — which is exactly how a broken RLS test
 * suite goes green for a year.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  createSeededDb,
  actAs,
  actAsService,
  loginAs,
} from "../scripts/db-harness.mjs";

let db: PGlite;

const EXEC = "exec@nexus.demo";
const TECH_LEAD = "amara@nexus.demo";   // lead, Techspecialist
const TECH_STAFF = "chidi@nexus.demo";  // staff, Techspecialist
const MEDIA_LEAD = "tunde@nexus.demo";  // lead, Media Hub
const MEDIA_STAFF = "ngozi@nexus.demo"; // staff, Media Hub

async function q(sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).rows as Record<string, any>[];
}

async function profileIdOf(email: string) {
  await actAsService(db);
  const rows = await q("select id from profiles where email = $1", [email]);
  return rows[0].id as string;
}

beforeAll(async () => {
  db = await createSeededDb();
}, 240_000);

afterAll(async () => {
  await db?.close();
});

describe("anonymous callers", () => {
  it("see nothing at all", async () => {
    await actAs(db, null);
    for (const table of ["profiles", "commitments", "reconciliations", "check_ins"]) {
      const rows = await q(`select count(*)::int as n from ${table}`);
      expect(rows[0].n, `${table} leaked to anonymous`).toBe(0);
    }
  });
});

describe("check-in privacy", () => {
  it("lets a person read their own raw check-ins", async () => {
    await loginAs(db, TECH_STAFF);
    const rows = await q("select count(*)::int as n from check_ins");
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("hides raw check-ins from that person's own department lead", async () => {
    const staffId = await profileIdOf(TECH_STAFF);
    await loginAs(db, TECH_LEAD);
    const rows = await q(
      "select count(*)::int as n from check_ins where profile_id = $1",
      [staffId],
    );
    expect(rows[0].n).toBe(0);
  });

  it("hides raw check-ins from the executive", async () => {
    const staffId = await profileIdOf(TECH_STAFF);
    await loginAs(db, EXEC);
    const rows = await q(
      "select count(*)::int as n from check_ins where profile_id = $1",
      [staffId],
    );
    expect(rows[0].n).toBe(0);
  });
});

describe("the employee sees it first", () => {
  it("shows an employee their own reconciliation while it is still in review", async () => {
    await loginAs(db, MEDIA_STAFF);
    const rows = await q(
      "select count(*)::int as n from reconciliations where status = 'awaiting_employee'",
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("HIDES an in-review reconciliation from the executive", async () => {
    // The load-bearing assertion of the entire trust model.
    await actAsService(db);
    const pending = await q(`
      select r.id, r.profile_id
      from reconciliations r
      join profiles p on p.id = r.profile_id
      where r.status = 'awaiting_employee' and p.email <> $1
      limit 1
    `, [EXEC]);
    expect(pending.length).toBe(1);

    await loginAs(db, EXEC);
    const seen = await q("select count(*)::int as n from reconciliations where id = $1", [
      pending[0].id,
    ]);
    expect(seen[0].n).toBe(0);
  });

  it("HIDES an in-review reconciliation from that person's lead", async () => {
    await actAsService(db);
    const pending = await q(`
      select r.id
      from reconciliations r
      join profiles p on p.id = r.profile_id
      where r.status = 'awaiting_employee' and p.email = $1
      limit 1
    `, [MEDIA_STAFF]);
    expect(pending.length).toBe(1);

    await loginAs(db, MEDIA_LEAD);
    const seen = await q("select count(*)::int as n from reconciliations where id = $1", [
      pending[0].id,
    ]);
    expect(seen[0].n).toBe(0);
  });

  it("reveals it upward once the employee has confirmed", async () => {
    await actAsService(db);
    const pending = await q(`
      select r.id
      from reconciliations r
      join profiles p on p.id = r.profile_id
      where r.status = 'awaiting_employee' and p.email = $1
      limit 1
    `, [MEDIA_STAFF]);

    // The employee confirms.
    await loginAs(db, MEDIA_STAFF);
    await q(
      `update reconciliations
          set status = 'confirmed', confirmed_at = now(), employee_note = 'context added'
        where id = $1`,
      [pending[0].id],
    );

    await loginAs(db, MEDIA_LEAD);
    const seen = await q("select count(*)::int as n from reconciliations where id = $1", [
      pending[0].id,
    ]);
    expect(seen[0].n).toBe(1);
  });

  it("lets an executive read settled history", async () => {
    await loginAs(db, EXEC);
    const rows = await q(
      "select count(*)::int as n from reconciliations where status = 'auto_confirmed'",
    );
    expect(rows[0].n).toBeGreaterThan(20);
  });
});

/*
 * A unit exists because the organisation said so, not because somebody was
 * placed in it.
 *
 * department_cycle_health INNER JOINED profiles, so a unit nobody had been
 * assigned to contributed no rows and vanished from every surface built on the
 * view — the Chairman's Units page, unit health, and the per-unit section of
 * the executive briefing.
 *
 * Found in production: four units created in Techspecialist Consulting
 * Limited, zero rows in the view. The administrator's reasonable conclusion was
 * that creating them had failed. Every unit passes through this state on the
 * day it is made, which makes it the first thing a new organisation sees.
 */
describe("a unit with nobody in it", () => {
  it("still appears, with honest zeroes rather than not at all", async () => {
    await actAsService(db);

    const [{ org_id, cycle_id }] = await q(
      `select cy.org_id, cy.id as cycle_id
         from cycles cy
        where cy.kind = 'week' and cy.starts_on <= current_date
        order by cy.starts_on desc limit 1`,
    );

    const [{ id: deptId }] = await q(
      `insert into departments (org_id, name, slug, color)
       values ($1, 'Empty On Purpose', 'empty-on-purpose', '#7d8590')
       returning id`,
      [org_id],
    );

    const rows = await q(
      `select people_reporting::int as people_reporting,
              people_responded::int as people_responded,
              delivery_rate
         from department_cycle_health
        where department_id = $1 and cycle_id = $2`,
      [deptId, cycle_id],
    );

    expect(rows).toHaveLength(1);
    /*
     * Zero, not one. Under a LEFT JOIN the null-profile row is still a row, so
     * count(*) would report one expected reporter who never files — the unit
     * would sit at 0/1 forever and every compliance figure above it would be
     * wrong by one per empty unit.
     */
    expect(rows[0].people_reporting).toBe(0);
    expect(rows[0].people_responded).toBe(0);
    // No rate is honest. A made-up 0% would read as a unit that failed.
    expect(rows[0].delivery_rate).toBeNull();

    // And an archived unit stops being listed, which is what archiving is for.
    await q(`update departments set archived_at = now() where id = $1`, [deptId]);
    const afterArchive = await q(
      `select 1 from department_cycle_health where department_id = $1`,
      [deptId],
    );
    expect(afterArchive).toHaveLength(0);

    await q(`delete from departments where id = $1`, [deptId]);
  });

  it("does not distort the counts of a unit that does have people", async () => {
    /*
     * The guard on the fix above. A LEFT JOIN that quietly changed the numbers
     * for populated units would trade a missing row for wrong figures, which is
     * the worse of the two.
     */
    await actAsService(db);
    const rows = await q(
      `select people_reporting::int as people_reporting,
              people_responded::int as people_responded
         from department_cycle_health
        where people_reporting > 0`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.people_responded).toBeLessThanOrEqual(r.people_reporting);
    }
  });
});

describe("views do not launder data around the policies", () => {
  /*
   * A PostgreSQL view runs as its OWNER unless created WITH
   * (security_invoker = true). Because migrations run as a superuser, a view
   * over a protected table is an RLS bypass by default — and an aggregate view
   * is exactly the kind of thing someone adds later without thinking about it.
   *
   * This was a live hole in this codebase: department_cycle_health returned all
   * 120 reconciliations to a staff member entitled to 8.
   */
  it("keeps department_cycle_health inside the reader's permissions", async () => {
    await actAsService(db);
    const [{ total }] = await q("select count(*)::int as total from reconciliations");

    await loginAs(db, MEDIA_STAFF);
    const [{ direct }] = await q("select count(*)::int as direct from reconciliations");
    expect(direct).toBeLessThan(total); // the policy is doing something

    /*
     * Assert what must not escape, not a number that happened to match.
     *
     * This used to compare sum(people_reporting) against the reader's visible
     * reconciliations — an invariant that held only because the view counted
     * reconciliation ROWS. Migration 0013 made it count PEOPLE, which is what
     * the column always claimed to mean, and the old assertion started failing
     * on a view that leaks nothing.
     *
     * What actually matters is that nothing derived from reconciliations
     * exceeds what this reader may read of them, and that the view exposes no
     * department they cannot already see. Both are checked directly below, so
     * this test now fails for a leak rather than for a definition change.
     */
    const [{ responded }] = await q(
      "select coalesce(sum(people_responded), 0)::int as responded from department_cycle_health",
    );
    const [{ delivered }] = await q(
      "select coalesce(sum(delivered_count), 0)::int as delivered from department_cycle_health",
    );
    const [{ drops }] = await q(
      "select coalesce(sum(silent_drop_count), 0)::int as drops from department_cycle_health",
    );
    const [{ deliveredDirect }] = await q(
      "select coalesce(sum(delivered_count), 0)::int as \"deliveredDirect\" from reconciliations",
    );
    const [{ dropsDirect }] = await q(
      "select coalesce(sum(silent_drop_count), 0)::int as \"dropsDirect\" from reconciliations",
    );

    // Every reconciliation-derived figure stays inside what they may read.
    expect(responded).toBeLessThanOrEqual(direct);
    expect(delivered).toBeLessThanOrEqual(deliveredDirect);
    expect(drops).toBeLessThanOrEqual(dropsDirect);

    // And the view names no unit they cannot already see in `departments`.
    const [{ viaDepts }] = await q(
      "select count(distinct department_id)::int as \"viaDepts\" from department_cycle_health",
    );
    const [{ ownDepts }] = await q(
      "select count(*)::int as \"ownDepts\" from departments",
    );
    expect(viaDepts).toBeLessThanOrEqual(ownDepts);
  });

  it("keeps dependency_edges inside the reader's permissions", async () => {
    await actAsService(db);
    const [{ total }] = await q(
      "select coalesce(sum(blocked_count), 0)::int as total from dependency_edges",
    );

    await loginAs(db, MEDIA_STAFF); // Media Hub staff: not party to the Tech↔Creative block
    const [{ via }] = await q(
      "select coalesce(sum(blocked_count), 0)::int as via from dependency_edges",
    );

    expect(total).toBeGreaterThan(0);
    expect(via).toBeLessThan(total);
  });

  /*
   * Exactly one view is allowed to run as its owner, and it has to earn it.
   *
   * submission_status exists because PRD F18 needs HR to see who reported and
   * who did not, while check_ins stays readable only by its author. That is a
   * COLUMN distinction — envelope yes, letter no — and RLS only filters rows,
   * so no policy can express it. The view names a fixed column list that
   * excludes raw_text and carries its own visibility predicate instead.
   *
   * Anything else appearing in this list is an accident.
   */
  const DEFINER_VIEWS_BY_DESIGN = ["submission_status"];

  it("declares security_invoker on every view but the documented exception", async () => {
    await actAsService(db);
    const rows = await q(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and not coalesce(
          (select option_value from pg_options_to_table(c.reloptions)
            where option_name = 'security_invoker')::boolean, false)
    `);
    expect(rows.map((r) => r.relname).sort()).toEqual(DEFINER_VIEWS_BY_DESIGN);
  });

  it("keeps raw check-in text out of the one definer view", async () => {
    // The exception is only acceptable while this holds.
    await actAsService(db);
    const cols = await q(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'submission_status'
    `);
    const names = cols.map((c) => c.column_name);
    expect(names).not.toContain("raw_text");
    expect(names).not.toContain("transcript");
    expect(names).not.toContain("raw_payload");
  });

  it("shows a lead their unit's submissions but not another unit's", async () => {
    await loginAs(db, TECH_LEAD);
    const [own] = await q(`
      select count(*)::int as n
      from submission_status s
      join profiles p on p.id = s.profile_id
      where p.department_id = (select department_id from profiles where email = $1)
    `, [TECH_LEAD]);
    const [other] = await q(`
      select count(*)::int as n
      from submission_status s
      join profiles p on p.id = s.profile_id
      where p.email = $1
    `, [MEDIA_STAFF]);

    expect(own.n).toBeGreaterThan(0);
    expect(other.n).toBe(0);
  });
});

describe("departmental scope", () => {
  it("lets a lead see their own department's commitments", async () => {
    const staffId = await profileIdOf(TECH_STAFF);
    await loginAs(db, TECH_LEAD);
    const rows = await q(
      "select count(*)::int as n from commitments where profile_id = $1",
      [staffId],
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("stops a lead reading another department's commitments", async () => {
    const otherId = await profileIdOf(MEDIA_STAFF);
    await loginAs(db, TECH_LEAD);
    const rows = await q(
      "select count(*)::int as n from commitments where profile_id = $1",
      [otherId],
    );
    expect(rows[0].n).toBe(0);
  });

  it("stops one staff member reading another's commitments", async () => {
    const otherId = await profileIdOf(MEDIA_STAFF);
    await loginAs(db, TECH_STAFF);
    const rows = await q(
      "select count(*)::int as n from commitments where profile_id = $1",
      [otherId],
    );
    expect(rows[0].n).toBe(0);
  });

  it("gives the executive the whole organisation", async () => {
    await actAsService(db);
    const [{ total }] = await q("select count(*)::int as total from commitments");
    await loginAs(db, EXEC);
    const [{ visible }] = await q("select count(*)::int as visible from commitments");
    expect(visible).toBe(total);
  });
});

describe("advice and notifications are addressed", () => {
  it("shows a person only advice written for them", async () => {
    await actAsService(db);
    const tech = await profileIdOf(TECH_STAFF);
    const media = await profileIdOf(MEDIA_STAFF);
    const org = (await q("select id from organizations where slug = 'nexus-demo'"))[0].id;

    await actAsService(db);
    for (const [recipient, title] of [
      [tech, "for chidi"],
      [media, "for ngozi"],
    ] as const) {
      await q(
        `insert into advice (org_id, audience, kind, recipient_profile_id, title, body)
         values ($1, 'employee', 'nudge', $2, $3, 'body')`,
        [org, recipient, title],
      );
    }

    await loginAs(db, TECH_STAFF);
    const rows = await q("select title from advice");
    expect(rows.map((r) => r.title)).toEqual(["for chidi"]);
  });
});

describe("raw check-in text is append-only", () => {
  it("refuses to rewrite what a human wrote", async () => {
    await actAsService(db);
    const [row] = await q(
      "select id, raw_text from check_ins where raw_text is not null limit 1",
    );

    await expect(
      db.query("update check_ins set raw_text = $1 where id = $2", [
        "something else entirely",
        row.id,
      ]),
    ).rejects.toThrow(/append-only/);
  });

  it("allows appending a follow-up reply", async () => {
    await actAsService(db);
    const [row] = await q(
      "select id, raw_text from check_ins where raw_text is not null limit 1",
    );
    const appended = `${row.raw_text} Also: the client pushed the date.`;

    await db.query("update check_ins set raw_text = $1 where id = $2", [
      appended,
      row.id,
    ]);

    const [after] = await q("select raw_text from check_ins where id = $1", [row.id]);
    expect(after.raw_text).toBe(appended);
  });
});

/*
 * Administration.
 *
 * The routes check capability and return a clean 403, but a route check is a
 * courtesy — it produces a good error message, it is not the boundary. These
 * assert the boundary: what the database itself refuses, from the seat of a
 * real unprivileged user, whatever the interface happens to offer.
 */
describe("administration is enforced by policy, not by a hidden link", () => {
  const ADMIN = "admin@nexus.demo";

  it("lets nobody but the administrator read the audit log", async () => {
    /*
     * Ids first. profileIdOf drops to the service role to read one, so
     * fetching it after taking a seat quietly gives the seat away — and
     * loginAs already establishes the seat, so a following actAs with a
     * PROFILE id overwrites a JWT subject that wants a USER id. That is how
     * the first version of this test managed to have the administrator's own
     * insert refused by the administrator's own policy.
     */
    const adminId = await profileIdOf(ADMIN);

    // The administrator writes one, naming themselves — which the policy
    // requires: `actor_id = current_profile_id()`.
    await loginAs(db, ADMIN);
    await db.query(
      `insert into audit_events (org_id, actor_id, actor_name, action, summary)
       values ((select org_id from profiles where id = $1), $1,
               'Tolu Adebayo', 'department.created',
               'Tolu Adebayo created the unit Finance.')`,
      [adminId],
    );
    expect(await q("select id from audit_events")).toHaveLength(1);

    for (const email of [TECH_LEAD, TECH_STAFF, EXEC]) {
      await loginAs(db, email);
      expect(await q("select id from audit_events")).toHaveLength(0);
    }
  });

  it("refuses an audit row attributed to somebody else", async () => {
    const adminId = await profileIdOf(ADMIN);
    const leadId = await profileIdOf(TECH_LEAD);

    await loginAs(db, ADMIN);

    /*
     * The clause that makes the log worth keeping. Without it an administrator
     * could write history blaming a colleague, and a forgeable record is one
     * people trust and should not.
     */
    await expect(
      db.query(
        `insert into audit_events (org_id, actor_id, actor_name, action, summary)
         values ((select org_id from profiles where id = $1), $2,
                 'Amara Okonkwo', 'department.archived', 'Amara archived Growth.')`,
        [adminId, leadId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("never lets an audit row be edited or deleted", async () => {
    await loginAs(db, ADMIN);

    // Append-only by omission: there is no update policy and no delete policy,
    // and RLS denies what it does not permit. Both silently affect no rows.
    await db.query("update audit_events set summary = 'rewritten'");
    await db.query("delete from audit_events");
    const rows = await q("select summary from audit_events");
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).not.toBe("rewritten");
  });

  /*
   * TRUNCATE is not row-level. RLS never sees it: Postgres checks the privilege
   * and empties the table, whatever the policies say. So "append-only because
   * there is no delete policy" is only true while the role also lacks the
   * statement that goes around policies — which Supabase's default privileges
   * had quietly granted. Migration 0019 takes it back.
   */
  it("cannot be truncated, which no policy could have prevented", async () => {
    await loginAs(db, ADMIN);
    await expect(db.query("truncate audit_events")).rejects.toThrow(/permission denied/i);

    await actAsService(db);
    expect(await q("select id from audit_events")).not.toHaveLength(0);
  });

  it("lets only the administrator restructure the organisation", async () => {
    await loginAs(db, TECH_LEAD);

    await db.query("update departments set name = 'Renamed by a lead'");
    await db.query("update organizations set name = 'Renamed by a lead'");

    await actAsService(db);
    expect(
      await q("select id from departments where name = 'Renamed by a lead'"),
    ).toHaveLength(0);
    expect(
      await q("select id from organizations where name = 'Renamed by a lead'"),
    ).toHaveLength(0);
  });

  /*
   * PRD F17: the Chairman's signed-in view "is read-only and carries no
   * administrative capability". 0006 granted him department writes anyway, and
   * it went unnoticed for as long as no interface offered him the control —
   * which is the whole problem with a policy nothing exercises. 0017 removed
   * it.
   */
  it("does not let the Chairman restructure the organisation either", async () => {
    await loginAs(db, EXEC);

    await db.query("update departments set name = 'Renamed by the Chairman'");

    await actAsService(db);
    expect(
      await q("select id from departments where name = 'Renamed by the Chairman'"),
    ).toHaveLength(0);
  });
});
