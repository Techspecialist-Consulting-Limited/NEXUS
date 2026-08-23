/* eslint-disable @typescript-eslint/no-explicit-any --
 * Rows here come straight back from ad-hoc SQL, so their shape changes per
 * query and per test. Declaring an interface for each would be noise that
 * hides the assertions; `any` on the row bag is the honest description.
 */
/**
 * The notification budget.
 *
 * A "proactive" assistant with no volume ceiling is a spam machine, and a spam
 * machine gets muted in week two — after which none of the intelligence in the
 * rest of this system reaches anybody. enqueue_notification is therefore the
 * single door into the notifications table, and these tests hold that door
 * shut.
 *
 * Suppression is recorded with a reason rather than silently dropped, so the
 * thresholds can later be tuned from evidence instead of vibes.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createSeededDb, actAsService } from "../scripts/db-harness.mjs";

let db: PGlite;
let orgId: string;

async function q(sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).rows as Record<string, any>[];
}

async function freshProfile(name: string) {
  const [row] = await q(
    `insert into profiles (org_id, email, full_name, role, timezone,
                           quiet_hours_start, quiet_hours_end)
     values ($1, $2, $3, 'staff', 'Africa/Lagos', 0, 0)
     returning id`,
    [orgId, `${name}@nexus.test`, name],
  );
  return row.id as string;
}

beforeAll(async () => {
  db = await createSeededDb();
  await actAsService(db);
  orgId = (await q("select id from organizations where slug = 'nexus-demo'"))[0].id;
}, 240_000);

afterAll(async () => {
  await db?.close();
});

describe("daily budget", () => {
  it("delivers up to the cap and suppresses the rest with a reason", async () => {
    const profile = await freshProfile("budget");

    for (let i = 0; i < 6; i++) {
      await q("select enqueue_notification($1, 'nudge', $2, null, 2::smallint)", [
        profile,
        `nudge ${i}`,
      ]);
    }

    const rows = await q(
      `select status, suppressed_reason
         from notifications where profile_id = $1 order by created_at`,
      [profile],
    );

    const queued = rows.filter((r) => r.status === "queued");
    const suppressed = rows.filter((r) => r.status === "suppressed");

    expect(queued.length).toBe(2); // org default max_nudges_per_day
    expect(suppressed.length).toBe(4);
    for (const s of suppressed) {
      expect(s.suppressed_reason).toMatch(/daily budget/);
    }
  });

  it("counts queued notifications, so a burst cannot slip past the cap", async () => {
    // Counting only what has been *sent* would let ten enqueues in the same
    // tick each pass the check and then all deliver together.
    const profile = await freshProfile("burst");
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        q("select enqueue_notification($1, 'nudge', $2, null, 2::smallint)", [
          profile,
          `burst ${i}`,
        ]),
      ),
    );
    const [row] = await q(
      `select count(*) filter (where status = 'queued')::int as queued
         from notifications where profile_id = $1`,
      [profile],
    );
    expect(row.queued).toBeLessThanOrEqual(2);
  });

  it("never suppresses a critical escalation", async () => {
    const profile = await freshProfile("critical");
    for (let i = 0; i < 5; i++) {
      await q("select enqueue_notification($1, 'nudge', $2, null, 2::smallint)", [
        profile,
        `filler ${i}`,
      ]);
    }
    await q(
      "select enqueue_notification($1, 'escalation', 'Production is down', null, 0::smallint)",
      [profile],
    );

    const [row] = await q(
      `select status from notifications
        where profile_id = $1 and priority = 0`,
      [profile],
    );
    expect(row.status).toBe("queued");
  });

  it("respects an opt-out", async () => {
    const profile = await freshProfile("optout");
    await q(
      `update profiles
          set notification_prefs = notification_prefs || '{"nudges": false}'::jsonb
        where id = $1`,
      [profile],
    );
    await q("select enqueue_notification($1, 'nudge', 'unwanted', null, 2::smallint)", [
      profile,
    ]);

    const [row] = await q(
      "select status, suppressed_reason from notifications where profile_id = $1",
      [profile],
    );
    expect(row.status).toBe("suppressed");
    expect(row.suppressed_reason).toMatch(/disabled/);
  });
});

describe("quiet hours", () => {
  it("holds a notification until the window closes rather than dropping it", async () => {
    const profile = await freshProfile("quiet");

    // Put the recipient's quiet window around whatever time it is right now,
    // so the test is meaningful regardless of when it runs.
    const [{ hour }] = await q(
      `select extract(hour from (now() at time zone timezone))::int as hour
         from profiles where id = $1`,
      [profile],
    );
    const start = hour;
    const end = (hour + 2) % 24;
    await q(
      "update profiles set quiet_hours_start = $1, quiet_hours_end = $2 where id = $3",
      [start, end, profile],
    );

    await q("select enqueue_notification($1, 'nudge', 'later please', null, 2::smallint)", [
      profile,
    ]);

    const [row] = await q(
      "select status, scheduled_for, scheduled_for > now() as deferred from notifications where profile_id = $1",
      [profile],
    );
    expect(row.status).toBe("queued"); // held, not discarded
    expect(row.deferred).toBe(true);
  });
});
