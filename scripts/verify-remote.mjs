/**
 * Run the load-bearing membership rules against the REAL database.
 *
 * Every test so far has run on PGlite. It is genuine PostgreSQL, but it is not
 * *this* PostgreSQL — different version, different roles, and Supabase's own
 * auth schema underneath. The rules that decide who can see what are worth
 * confirming where they will actually run.
 *
 * Everything it creates is removed again, including on failure.
 *
 * Usage:  node --env-file-if-exists=.env.local scripts/verify-remote.mjs
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 20 });

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const SUFFIX = Date.now().toString(36);
const emails = {
  founder: `verify-founder-${SUFFIX}@nexus-verify.test`,
  joiner: `verify-joiner-${SUFFIX}@nexus-verify.test`,
  invited: `verify-invited-${SUFFIX}@nexus-verify.test`,
};
let orgId = null;

/** Impersonate a profile the way the app does, then run a query. */
async function asActor(tx, userId, fn) {
  await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
  await tx`set local role authenticated`;
  try {
    return await fn();
  } finally {
    await tx`reset role`;
  }
}

try {
  console.log("running against Supabase...\n");

  // --- founding -----------------------------------------------------------
  const [fu] = await sql`
    insert into auth.users (id, instance_id, aud, role, email,
                            encrypted_password, email_confirmed_at,
                            created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', ${emails.founder},
            '', now(), now(), now())
    returning id
  `;
  const [{ create_organization: founderProfile }] = await sql`
    select create_organization(${fu.id}::uuid, ${"Verify Co " + SUFFIX},
                               'Verify Founder', ${emails.founder})
  `;
  const [founder] = await sql`
    select org_id, role::text as role, status::text as status
    from profiles where id = ${founderProfile}
  `;
  orgId = founder.org_id;
  check("founder becomes admin", founder.role === "admin", founder.role);
  check("founder is active", founder.status === "active");

  const [{ weeks }] = await sql`
    select count(*)::int as weeks from cycles
    where org_id = ${orgId} and kind = 'week'
  `;
  check("new tenant gets a reporting calendar", weeks > 10, `${weeks} weeks`);

  // --- self-signup cannot pick a role -------------------------------------
  await sql`
    update organizations set allowed_domains = array['nexus-verify.test']
    where id = ${orgId}
  `;
  const [ju] = await sql`
    insert into auth.users (id, instance_id, aud, role, email,
                            encrypted_password, email_confirmed_at,
                            created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', ${emails.joiner},
            '', now(), now(), now())
    returning id
  `;
  const [{ request_to_join: joinerProfile }] = await sql`
    select request_to_join(${ju.id}::uuid,
      (select slug from organizations where id = ${orgId}),
      'Verify Joiner', ${emails.joiner}, null, 'executive'::org_role)
  `;
  const [joiner] = await sql`
    select role::text as role, requested_role::text as requested,
           status::text as status
    from profiles where id = ${joinerProfile}
  `;
  check("asked for executive, got staff", joiner.role === "staff", joiner.role);
  check("the request is recorded", joiner.requested === "executive");
  check("and is left pending", joiner.status === "pending");

  /*
   * The escalation guard, asserted on the OUTCOME rather than the mechanism.
   *
   * Two different defences stop this, at different depths: RLS removes the row
   * from a pending member's reach entirely, and the trigger refuses the change
   * for anyone who is not an admin. Pinning the test to one specific error
   * message made it fail the moment the stronger defence engaged first, which
   * is precisely backwards.
   */
  await sql.begin(async (tx) => {
    await asActor(tx, ju.id, async () => {
      await tx`update profiles set role = 'admin' where id = ${joinerProfile}`
        .catch(() => undefined);
    });
  });
  const [stillStaff] = await sql`
    select role::text as role from profiles where id = ${joinerProfile}
  `;
  check("a pending member cannot promote themselves", stillStaff.role === "staff",
        stillStaff.role);

  // --- invitations carry the role ----------------------------------------
  const [inv] = await sql`
    insert into invitations (org_id, email, role, invited_by)
    values (${orgId}, ${emails.invited}, 'lead'::org_role, ${founderProfile})
    returning token
  `;
  const [iu] = await sql`
    insert into auth.users (id, instance_id, aud, role, email,
                            encrypted_password, email_confirmed_at,
                            created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', ${emails.invited},
            '', now(), now(), now())
    returning id
  `;

  let wrongAddressRejected = false;
  try {
    await sql`
      select accept_invitation(${iu.id}::uuid, ${inv.token},
                               'Impostor', 'someone-else@nexus-verify.test')
    `;
  } catch (err) {
    wrongAddressRejected = /different email address/i.test(String(err.message));
  }
  check("a forwarded invitation is refused", wrongAddressRejected);

  const [{ accept_invitation: invitedProfile }] = await sql`
    select accept_invitation(${iu.id}::uuid, ${inv.token},
                             'Verify Invited', ${emails.invited})
  `;
  const [invited] = await sql`
    select role::text as role, status::text as status
    from profiles where id = ${invitedProfile}
  `;
  check("the invited role is granted", invited.role === "lead", invited.role);
  check("invited members skip the queue", invited.status === "active");

  // An ACTIVE non-admin is stopped by the trigger, which is the deeper guard.
  let triggerFired = false;
  try {
    await sql.begin(async (tx) => {
      await asActor(tx, iu.id, async () => {
        await tx`update profiles set role = 'admin' where id = ${invitedProfile}`;
      });
    });
  } catch (err) {
    triggerFired = /only an admin/i.test(String(err.message));
  }
  const [stillLead] = await sql`
    select role::text as role from profiles where id = ${invitedProfile}
  `;
  check("an active lead cannot promote themselves", triggerFired && stillLead.role === "lead",
        stillLead.role);

  // --- RLS actually filters ----------------------------------------------
  await sql.begin(async (tx) => {
    await asActor(tx, ju.id, async () => {
      const rows = await tx`select count(*)::int as n from profiles`;
      // A pending staff member should not enumerate the organisation.
      check("RLS filters for a pending member", rows[0].n <= 1, `${rows[0].n} row(s)`);
    });
  });

  await sql.begin(async (tx) => {
    await asActor(tx, fu.id, async () => {
      const rows = await tx`select count(*)::int as n from profiles`;
      check("the admin sees the roster", rows[0].n === 3, `${rows[0].n} of 3`);
    });
  });
} finally {
  // --- clean up -----------------------------------------------------------
  if (orgId) await sql`delete from organizations where id = ${orgId}`;
  await sql`delete from auth.users where email = any(${Object.values(emails)})`;
  const [{ left }] = await sql`
    select count(*)::int as left from auth.users
    where email like '%@nexus-verify.test'
  `;
  console.log(`\ncleaned up (${left} verify users left behind)`);
  await sql.end();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed on Supabase`);
process.exit(failed.length ? 1 : 0);
