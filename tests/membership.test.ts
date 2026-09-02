/**
 * Membership, invitations and role escalation.
 *
 * The product's stated flow is "sign up, pick your role, pick your
 * department". Implemented literally that is a self-service dropdown
 * containing "Chairman", and every number in the organisation behind it. These
 * tests pin down the version that is actually safe:
 *
 *   - self-signup always lands on staff, whatever it asks for
 *   - an invitation carries the role its sender chose
 *   - a forwarded invitation cannot be claimed by a different address
 *   - nobody edits their own role, even on a row they legitimately own
 *   - only the Administrator hands out authority, not the Chairman
 *   - HR sees the organisation, but still never reads anyone's raw words
 *
 * Everything runs as the unprivileged `authenticated` role. Run as the default
 * superuser these would pass regardless, because superusers bypass RLS.
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
let orgId: string;
let unitId: string;

type Row = Record<string, string | number | boolean | null>;

async function q(sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).rows as Row[];
}

/** Create an auth user with no membership — someone who just signed in. */
async function newAuthUser(email: string): Promise<string> {
  await actAsService(db);
  const [row] = await q("insert into auth.users (email) values ($1) returning id", [email]);
  return row.id as string;
}

beforeAll(async () => {
  db = await createSeededDb();
  await actAsService(db);
  orgId = String((await q("select id from organizations where slug = 'nexus-demo'"))[0].id);
  unitId = String(
    (await q("select id from departments where slug = 'automation'"))[0].id,
  );
  // Publish a domain so the self-signup path is reachable at all.
  await q("update organizations set allowed_domains = array['nexus.demo'] where id = $1", [
    orgId,
  ]);
}, 240_000);

afterAll(async () => {
  await db?.close();
});

// ---------------------------------------------------------------------------

describe("creating an organisation", () => {
  it("makes the founder an admin and gives the tenant a calendar", async () => {
    const user = await newAuthUser("founder@newco.test");
    const [{ create_organization: profileId }] = await q(
      "select create_organization($1, $2, $3, $4)",
      [user, "New Co Limited", "Ada Founder", "founder@newco.test"],
    );

    const [p] = await q(
      "select role::text as role, status::text as status, joined_via::text as via, org_id from profiles where id = $1",
      [profileId],
    );
    expect(p.role).toBe("admin");
    expect(p.status).toBe("active");
    expect(p.via).toBe("founder");

    // A tenant with no reporting weeks cannot accept a first check-in.
    const [{ weeks }] = await q(
      "select count(*)::int as weeks from cycles where org_id = $1 and kind = 'week'",
      [p.org_id],
    );
    expect(weeks).toBeGreaterThan(10);
  });

  it("de-collides slugs so two companies may share a name", async () => {
    const a = await newAuthUser("a@dup.test");
    const b = await newAuthUser("b@dup.test");
    await q("select create_organization($1, $2, $3, $4)", [a, "Acme", "A", "a@dup.test"]);
    await q("select create_organization($1, $2, $3, $4)", [b, "Acme", "B", "b@dup.test"]);

    const slugs = await q("select slug from organizations where name = 'Acme' order by slug");
    expect(slugs.map((r) => r.slug)).toEqual(["acme", "acme-1"]);
  });

  it("refuses a second organisation for the same account", async () => {
    const user = await newAuthUser("greedy@dup.test");
    await q("select create_organization($1, $2, $3, $4)", [user, "First", "G", "greedy@dup.test"]);
    await expect(
      q("select create_organization($1, $2, $3, $4)", [user, "Second", "G", "greedy@dup.test"]),
    ).rejects.toThrow(/already belongs/i);
  });
});

describe("self-signup", () => {
  it("lands on staff and pending no matter what role is requested", async () => {
    const user = await newAuthUser("hopeful@nexus.demo");
    const [{ request_to_join: profileId }] = await q(
      "select request_to_join($1, $2, $3, $4, $5, $6)",
      [user, "nexus-demo", "Hopeful Person", "hopeful@nexus.demo", unitId, "executive"],
    );

    const [p] = await q(
      `select role::text as role, requested_role::text as requested,
              status::text as status
         from profiles where id = $1`,
      [profileId],
    );

    // Asked for the keys to the organisation; got the front door.
    expect(p.requested).toBe("executive");
    expect(p.role).toBe("staff");
    expect(p.status).toBe("pending");
  });

  it("refuses an address whose domain the organisation has not published", async () => {
    const user = await newAuthUser("stranger@elsewhere.test");
    await expect(
      q("select request_to_join($1, $2, $3, $4, $5, $6)", [
        user,
        "nexus-demo",
        "Stranger",
        "stranger@elsewhere.test",
        null,
        "staff",
      ]),
    ).rejects.toThrow(/requires an invitation/i);
  });

  it("refuses a department belonging to a different organisation", async () => {
    const other = await newAuthUser("other@othr.test");
    const [{ create_organization: otherAdmin }] = await q(
      "select create_organization($1, $2, $3, $4)",
      [other, "Other Org", "O", "other@othr.test"],
    );
    const [{ org_id: otherOrg }] = await q("select org_id from profiles where id = $1", [
      otherAdmin,
    ]);
    const [foreign] = await q(
      "insert into departments (org_id, slug, name, color) values ($1, 'x', 'X', '#fff') returning id",
      [otherOrg],
    );

    const user = await newAuthUser("crosser@nexus.demo");
    await expect(
      q("select request_to_join($1, $2, $3, $4, $5, $6)", [
        user,
        "nexus-demo",
        "Crosser",
        "crosser@nexus.demo",
        foreign.id,
        "staff",
      ]),
    ).rejects.toThrow(/does not belong/i);
  });
});

describe("invitations", () => {
  async function invite(email: string, role: string, dept: string | null = null) {
    await actAsService(db);
    const [inviter] = await q("select id from profiles where email = 'chairman@nexus.invalid'");
    const [row] = await q(
      `insert into invitations (org_id, email, role, department_id, invited_by)
       values ($1, $2, $3::org_role, $4, $5) returning token`,
      [orgId, email.toLowerCase(), role, dept, inviter.id],
    );
    return row.token as string;
  }

  it("grants exactly the role the sender chose", async () => {
    const token = await invite("newlead@nexus.demo", "lead", unitId);
    const user = await newAuthUser("newlead@nexus.demo");

    const [{ accept_invitation: profileId }] = await q(
      "select accept_invitation($1, $2, $3, $4)",
      [user, token, "New Lead", "newlead@nexus.demo"],
    );

    const [p] = await q(
      `select role::text as role, status::text as status,
              joined_via::text as via, department_id
         from profiles where id = $1`,
      [profileId],
    );
    expect(p.role).toBe("lead");
    expect(p.status).toBe("active"); // invited people skip the waiting room
    expect(p.via).toBe("invitation");
    expect(p.department_id).toBe(unitId);
  });

  it("cannot be claimed by a different email address", async () => {
    // The load-bearing check: without it, forwarding an invitation hands your
    // role to whoever opened the mail.
    const token = await invite("intended@nexus.demo", "executive");
    const impostor = await newAuthUser("someone.else@nexus.demo");

    await expect(
      q("select accept_invitation($1, $2, $3, $4)", [
        impostor,
        token,
        "Someone Else",
        "someone.else@nexus.demo",
      ]),
    ).rejects.toThrow(/different email address/i);
  });

  it("is single use", async () => {
    const token = await invite("once@nexus.demo", "staff");
    const first = await newAuthUser("once@nexus.demo");
    await q("select accept_invitation($1, $2, $3, $4)", [
      first,
      token,
      "Once",
      "once@nexus.demo",
    ]);

    const second = await newAuthUser("once2@nexus.demo");
    await expect(
      q("select accept_invitation($1, $2, $3, $4)", [
        second,
        token,
        "Once Again",
        "once@nexus.demo",
      ]),
    ).rejects.toThrow(/not valid any more|already belongs/i);
  });

  it("expires", async () => {
    const token = await invite("stale@nexus.demo", "staff");
    await actAsService(db);
    await q("update invitations set expires_at = now() - interval '1 day' where token = $1", [
      token,
    ]);

    const user = await newAuthUser("stale@nexus.demo");
    await expect(
      q("select accept_invitation($1, $2, $3, $4)", [user, token, "Stale", "stale@nexus.demo"]),
    ).rejects.toThrow(/not valid any more/i);
  });

  it("can only be issued by an admin or the Chairman", async () => {
    // A lead runs a unit; they do not get to mint another lead.
    await loginAs(db, "ifeanyi.obiora@nexus.invalid"); // lead
    const attempt = await q(
      `insert into invitations (org_id, email, role, invited_by)
       select $1, 'sneaky@nexus.demo', 'executive'::org_role, id
         from profiles where email = 'ifeanyi.obiora@nexus.invalid'
       returning id`,
      [orgId],
    ).catch(() => []);
    expect(attempt.length).toBe(0);
  });

  it("cannot be issued by the Chairman either", async () => {
    // PRD F17: his signed-in view "is read-only and carries no administrative
    // capability". He reads the organisation; he does not decide who may.
    const { profileId } = await loginAs(db, "chairman@nexus.invalid");
    const attempt = await q(
      `insert into invitations (org_id, email, role, invited_by)
       values ($1, 'chairmansent@nexus.demo', 'staff'::org_role, $2)
       returning id`,
      [orgId, profileId],
    ).catch(() => []);
    expect(attempt.length).toBe(0);
  });

  it("is issuable by the Administrator", async () => {
    const { profileId } = await loginAs(db, "admin@nexus.invalid");
    const rows = await q(
      `insert into invitations (org_id, email, role, invited_by)
       values ($1, 'legit@nexus.demo', 'staff'::org_role, $2)
       returning id`,
      [orgId, profileId],
    );
    expect(rows.length).toBe(1);
  });
});

describe("nobody promotes themselves", () => {
  it("blocks a staff member editing their own role", async () => {
    const { profileId } = await loginAs(db, "sade.adeniyi@nexus.invalid");
    await expect(
      db.query("update profiles set role = 'executive' where id = $1", [profileId]),
    ).rejects.toThrow(/only an admin/i);
  });

  it("blocks a lead promoting themselves", async () => {
    const { profileId } = await loginAs(db, "ifeanyi.obiora@nexus.invalid");
    await expect(
      db.query("update profiles set role = 'admin' where id = $1", [profileId]),
    ).rejects.toThrow(/only an admin/i);
  });

  it("blocks a pending member activating themselves", async () => {
    await actAsService(db);
    const user = await newAuthUser("waiter@nexus.demo");
    const [{ request_to_join: profileId }] = await q(
      "select request_to_join($1, $2, $3, $4, $5, $6)",
      [user, "nexus-demo", "Waiter", "waiter@nexus.demo", null, "staff"],
    );

    /*
     * Asserted on the outcome, not on which defence caught it. Since 0010 a
     * pending member has no organisational context at all, so RLS removes the
     * row before the trigger is ever reached — the update simply affects
     * nothing. Both are correct; pinning to one error message would fail the
     * moment the stronger one engaged first.
     */
    await actAs(db, user);
    await db
      .query("update profiles set status = 'active' where id = $1", [profileId])
      .catch(() => undefined);

    await actAsService(db);
    const [after] = await q(
      "select status::text as status from profiles where id = $1",
      [profileId],
    );
    expect(after.status).toBe("pending");
  });

  it("gives a pending member no organisational context", async () => {
    // The leak this replaced: a pending profile still had an org_id, so
    // every org-scoped policy treated them as a member and the whole roster
    // was readable before anyone had approved them.
    await actAsService(db);
    const user = await newAuthUser("nocontext@nexus.demo");
    await q("select request_to_join($1, $2, $3, $4, $5, $6)", [
      user,
      "nexus-demo",
      "No Context",
      "nocontext@nexus.demo",
      null,
      "staff",
    ]);

    await actAs(db, user);
    const rows = await q("select count(*)::int as n from profiles");
    expect(rows[0].n).toBeLessThanOrEqual(1); // their own row, and nothing else
  });

  it("lets the Administrator place somebody", async () => {
    await actAsService(db);
    const user = await newAuthUser("placeme@nexus.demo");
    const [{ request_to_join: profileId }] = await q(
      "select request_to_join($1, $2, $3, $4, $5, $6)",
      [user, "nexus-demo", "Place Me", "placeme@nexus.demo", unitId, "lead"],
    );

    await loginAs(db, "admin@nexus.invalid");
    await db.query(
      "update profiles set role = 'lead', status = 'active' where id = $1",
      [profileId],
    );

    await actAsService(db);
    const [p] = await q(
      "select role::text as role, status::text as status from profiles where id = $1",
      [profileId],
    );
    expect(p.role).toBe("lead");
    expect(p.status).toBe("active");
  });

  it("refuses to move a profile between organisations", async () => {
    await actAsService(db);
    const [victim] = await q("select id from profiles where email = 'sade.adeniyi@nexus.invalid'");
    const [other] = await q("select id from organizations where slug = 'acme'");

    await loginAs(db, "admin@nexus.invalid");
    await expect(
      db.query("update profiles set org_id = $1 where id = $2", [other.id, victim.id]),
    ).rejects.toThrow(/between organisations/i);
  });
});

describe("HR", () => {
  async function makeHr() {
    return loginAs(db, "folake.durojaiye@nexus.invalid");
  }

  it("sees the whole organisation's commitments", async () => {
    await actAsService(db);
    const [{ total }] = await q("select count(*)::int as total from commitments");

    await makeHr();
    const [{ visible }] = await q("select count(*)::int as visible from commitments");
    expect(visible).toBe(total);
  });

  it("still cannot read anybody's raw check-in text", async () => {
    // The promise that makes people write the truth instead of writing for an
    // audience. HR is the enforcement partner and still does not get this.
    await actAsService(db);
    const [other] = await q("select id from profiles where email = 'sade.adeniyi@nexus.invalid'");

    await makeHr();
    const rows = await q("select count(*)::int as n from check_ins where profile_id = $1", [
      other.id,
    ]);
    expect(rows[0].n).toBe(0);
  });

  it("cannot see a reconciliation the employee has not confirmed", async () => {
    await actAsService(db);
    const pending = await q(
      "select id from reconciliations where status = 'awaiting_employee' limit 1",
    );
    expect(pending.length).toBe(1);

    await makeHr();
    const seen = await q("select count(*)::int as n from reconciliations where id = $1", [
      pending[0].id,
    ]);
    expect(seen[0].n).toBe(0);
  });

  it("cannot hand out roles", async () => {
    const { profileId } = await makeHr();
    const attempt = await q(
      `insert into invitations (org_id, email, role, invited_by)
       values ($1, 'hrinvite@nexus.demo', 'staff'::org_role, $2)
       returning id`,
      [orgId, profileId],
    ).catch(() => []);
    expect(attempt.length).toBe(0);
  });
});
