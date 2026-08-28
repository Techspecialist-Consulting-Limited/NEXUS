import { asService } from "./db";

/*
 * The organisation directory, and the one destructive act in the product.
 *
 * WHY IT READS AS THE SERVICE ROLE.
 *
 * Every other read in NEXUS goes through asActor, and row-level security means
 * an actor can only ever see their own organisation. That is correct, and it
 * is also exactly why this cannot use it: the point of this page is to list
 * organisations you are NOT in, so that a pilot can be torn down and rebuilt
 * without somebody editing SQL by hand.
 *
 * THE SECURITY POSITION, STATED PLAINLY.
 *
 * These functions bypass row-level security. The ONLY thing standing between a
 * caller and another tenant's data is the capability check in the route that
 * calls them — app/api/admin/organizations/route.ts — plus a typed
 * confirmation. That is a deliberate pilot-stage decision, made explicitly,
 * and it is not good enough for real customers: an administrator of one
 * organisation can currently delete another. Before this product carries more
 * than one real tenant, deletion must be restricted to organisations the
 * caller administers, or moved behind a separate operator credential.
 *
 * WHAT DELETION ACTUALLY DOES.
 *
 * Every org-scoped table declares `org_id ... references organizations(id) on
 * delete cascade` — profiles, departments, cycles, check-ins, commitments,
 * reconciliations, insights, digests, notifications, invitations and the audit
 * log. So one statement removes the organisation and everything under it, in
 * one transaction, by the database rather than by a list of deletes in this
 * file that would fall out of date the first time a table was added.
 */

export type OrganizationSummary = {
  id: string;
  name: string;
  created_at: string;
  people: number;
  departments: number;
  cycles: number;
  check_ins: number;
  commitments: number;
};

/** Every organisation in the database, largest first. */
export async function allOrganizations(): Promise<OrganizationSummary[]> {
  return asService(
    (sql) => sql<OrganizationSummary>`
      select o.id,
             o.name,
             o.created_at,
             (select count(*) from profiles     p where p.org_id = o.id)::int as people,
             (select count(*) from departments  d where d.org_id = o.id)::int as departments,
             (select count(*) from cycles       c where c.org_id = o.id)::int as cycles,
             (select count(*) from check_ins    k where k.org_id = o.id)::int as check_ins,
             (select count(*) from commitments  m where m.org_id = o.id)::int as commitments
      from organizations o
      order by o.created_at desc
    `,
  );
}

/** One organisation by id, or null. Used to check a typed confirmation. */
export async function findOrganization(
  id: string,
): Promise<{ id: string; name: string } | null> {
  const rows = await asService(
    (sql) => sql<{ id: string; name: string }>`
      select id, name from organizations where id = ${id}
    `,
  );
  return rows[0] ?? null;
}

export type DeletionReceipt = {
  name: string;
  people: number;
  departments: number;
  cycles: number;
  check_ins: number;
  commitments: number;
  /** Sign-in accounts removed. Zero unless `dropAuth` was asked for. */
  accounts: number;
};

/**
 * Remove an organisation and everything that belongs to it.
 *
 * `dropAuth` also removes the Supabase sign-in accounts of its people — but
 * ONLY those that no surviving profile still claims. Without it the accounts
 * remain and can sign in to a product where they have no profile, which lands
 * them on onboarding to create a new organisation. That is a perfectly
 * reasonable outcome for a tester and a confusing one for anybody else, so it
 * is a choice rather than a default.
 *
 * The counts are read BEFORE the delete. Afterwards there is nothing left to
 * count, and "deleted an organisation" without saying how much went with it is
 * not a receipt anybody can check.
 */
export async function deleteOrganization(
  id: string,
  options: { dropAuth?: boolean } = {},
): Promise<DeletionReceipt | null> {
  const before = await asService(
    (sql) => sql<OrganizationSummary>`
      select o.id,
             o.name,
             o.created_at,
             (select count(*) from profiles     p where p.org_id = o.id)::int as people,
             (select count(*) from departments  d where d.org_id = o.id)::int as departments,
             (select count(*) from cycles       c where c.org_id = o.id)::int as cycles,
             (select count(*) from check_ins    k where k.org_id = o.id)::int as check_ins,
             (select count(*) from commitments  m where m.org_id = o.id)::int as commitments
      from organizations o
      where o.id = ${id}
    `,
  );
  const org = before[0];
  if (!org) return null;

  /*
   * Read the sign-in accounts while the profiles still exist — they cascade
   * away with the organisation a moment from now.
   */
  const accounts = options.dropAuth
    ? await asService(
        (sql) => sql<{ user_id: string }>`
          select distinct p.user_id
          from profiles p
          where p.org_id = ${id} and p.user_id is not null
        `,
      )
    : [];

  await asService((sql) => sql`delete from organizations where id = ${id}`);

  let removedAccounts = 0;
  if (accounts.length > 0) {
    /*
     * Only accounts nothing still claims.
     *
     * Somebody can hold a profile in two organisations; deleting one of them
     * must not lock them out of the other. Checked AFTER the cascade, so the
     * profiles that just went are correctly no longer claiming anything.
     */
    const ids = accounts.map((a) => a.user_id);
    try {
      const gone = await asService(
        (sql) => sql<{ id: string }>`
          delete from auth.users u
          where u.id = any(${ids}::uuid[])
            and not exists (select 1 from profiles p where p.user_id = u.id)
          returning u.id
        `,
      );
      removedAccounts = gone.length;
    } catch (error) {
      /*
       * Never fail the caller here. The organisation is already gone — that
       * statement committed — and reporting an error now would say the
       * deletion failed when it did not. Locally there is no auth schema at
       * all (PGlite is Postgres, not Supabase), which is the ordinary case for
       * landing in this branch.
       */
      console.warn("[nexus] could not remove sign-in accounts", error);
    }
  }

  return {
    name: org.name,
    people: org.people,
    departments: org.departments,
    cycles: org.cycles,
    check_ins: org.check_ins,
    commitments: org.commitments,
    accounts: removedAccounts,
  };
}
