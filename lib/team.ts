import { asActor } from "./db";
import type { OrgRole, MembershipStatus } from "./roles";

/*
 * The roster and the invitations behind it.
 *
 * Everything reads through asActor(), so RLS decides what comes back: an admin
 * or the Chairman sees the whole organisation, HR sees it read-only, and a
 * lead sees their own unit. There is no "and also check the role here" branch,
 * because that branch is where such checks get forgotten.
 */

export type Member = {
  profile_id: string;
  full_name: string;
  email: string;
  title: string | null;
  role: OrgRole;
  requested_role: OrgRole | null;
  status: MembershipStatus;
  department_id: string | null;
  department_name: string | null;
  color: string | null;
  joined_via: string;
  auth_provider: string | null;
  joined_at: string | null;
};

export async function listMembers(actor: string): Promise<Member[]> {
  return asActor(
    actor,
    (sql) => sql<Member>`
      select
        p.id as profile_id, p.full_name, p.email, p.title,
        p.role::text as role,
        p.requested_role::text as requested_role,
        p.status::text as status,
        p.department_id, d.name as department_name, d.color,
        p.joined_via::text as joined_via,
        p.auth_provider,
        p.joined_at
      from profiles p
      left join departments d on d.id = p.department_id
      where p.org_id = (select org_id from profiles where id = ${actor})
      order by
        -- Anyone waiting on a decision comes first: this page exists to clear
        -- that queue, and a pending person cannot do anything until it is.
        case p.status when 'pending' then 0 else 1 end,
        case p.role
          when 'admin' then 0 when 'executive' then 1 when 'hr' then 2
          when 'lead' then 3 else 4 end,
        p.full_name
    `,
  );
}


export type Invitation = {
  id: string;
  email: string;
  role: OrgRole;
  department_name: string | null;
  invited_by: string | null;
  expires_at: string;
  created_at: string;
};

export async function listInvitations(actor: string): Promise<Invitation[]> {
  return asActor(
    actor,
    (sql) => sql<Invitation>`
      select i.id, i.email, i.role::text as role,
             d.name as department_name,
             inviter.full_name as invited_by,
             i.expires_at, i.created_at
      from invitations i
      left join departments d on d.id = i.department_id
      left join profiles inviter on inviter.id = i.invited_by
      where i.org_id = (select org_id from profiles where id = ${actor})
        and i.accepted_at is null
        and i.revoked_at is null
        and i.expires_at > now()
      order by i.created_at desc
    `,
  );
}

export async function listDepartments(actor: string) {
  return asActor(
    actor,
    (sql) => sql<{ id: string; name: string; color: string }>`
      select id, name, color
      from departments
      where org_id = (select org_id from profiles where id = ${actor})
        /*
         * Live units only. Migration 0017 says what archiving is for in as
         * many words — "an archived unit stops appearing in the places people
         * pick a unit" — and this is one of those places, for both the
         * invitation form and the unit picker on each member.
         *
         * It reads every unit including retired ones until now, which was
         * harmless while nothing but an invitation used it and becomes a way
         * to quietly refill a unit somebody deliberately retired.
         */
        and archived_at is null
      order by name
    `,
  );
}

/**
 * Issue an invitation and return its token.
 *
 * The insert runs through asActor(), so the invitations_manage policy is what
 * actually decides whether this person may hand out authority — a lead's
 * attempt inserts nothing and returns no row.
 */
export async function createInvitation(
  actor: string,
  email: string,
  role: OrgRole,
  departmentId: string | null,
  title: string | null,
): Promise<{ id: string; token: string } | null> {
  const rows = await asActor(
    actor,
    (sql) => sql<{ id: string; token: string }>`
      insert into invitations (org_id, email, role, department_id, title, invited_by)
      select p.org_id, ${email.toLowerCase()}, ${role}::org_role,
             ${departmentId}::uuid, ${title}, p.id
      from profiles p
      where p.id = ${actor}
      on conflict (org_id, email) where accepted_at is null and revoked_at is null
      do update set
        role = excluded.role,
        department_id = excluded.department_id,
        title = excluded.title,
        expires_at = now() + interval '14 days'
      returning id, token
    `,
  );
  return rows[0] ?? null;
}

export async function revokeInvitation(actor: string, id: string): Promise<boolean> {
  const rows = await asActor(
    actor,
    (sql) => sql<{ id: string }>`
      update invitations set revoked_at = now()
      where id = ${id} and accepted_at is null and revoked_at is null
      returning id
    `,
  );
  return rows.length > 0;
}

/**
 * Place a pending member, or change an existing one's role.
 *
 * The trigger in migration 0008 is the real guard here: it refuses any role or
 * status change made by somebody who is not an admin or the Chairman, whatever
 * this function is asked to do.
 */
export async function updateMember(
  actor: string,
  profileId: string,
  patch: { role?: OrgRole; status?: MembershipStatus; departmentId?: string | null },
): Promise<boolean> {
  const rows = await asActor(
    actor,
    (sql) => sql<{ id: string }>`
      update profiles
         set role = coalesce(${patch.role ?? null}::org_role, role),
             status = coalesce(${patch.status ?? null}::membership_status, status),
             department_id = case
               when ${patch.departmentId !== undefined} then ${patch.departmentId ?? null}::uuid
               else department_id
             end,
             requested_role = case
               when ${patch.role ?? null}::org_role is not null then null
               else requested_role
             end
       where id = ${profileId}
       returning id
    `,
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Reporting compliance (PRD F18)
// ---------------------------------------------------------------------------

export type ComplianceRow = {
  profile_id: string;
  full_name: string;
  email: string;
  department_name: string | null;
  color: string | null;
  submitted: boolean;
  late: boolean | null;
  responded_at: string | null;
  characters_written: number;
};

/**
 * Who reported, who was late, and who did not.
 *
 * Reads `submission_status` (migration 0009) rather than `check_ins`. That
 * view exposes the envelope — arrived, when, how long — and structurally
 * cannot return the body, so HR can chase non-submitters without anybody's
 * raw words becoming an HR record.
 *
 * Left-joined from profiles so somebody who filed nothing still appears. A
 * compliance list that only shows submissions is a list of the people you did
 * not need to chase.
 */
export async function reportingCompliance(
  actor: string,
  cycleId: string,
): Promise<ComplianceRow[]> {
  return asActor(
    actor,
    (sql) => sql<ComplianceRow>`
      select
        p.id as profile_id, p.full_name, p.email,
        d.name as department_name, d.color,
        coalesce(s.submitted, false) as submitted,
        s.late,
        s.responded_at,
        coalesce(s.characters_written, 0)::int as characters_written
      from profiles p
      left join departments d on d.id = p.department_id
      -- ONE ROW PER PERSON, not per channel. submission_status is one row per
      -- check-in and carries the channel, so a plain left join fans out for
      -- anybody who replied both in-app and by email: they appeared twice in
      -- the list, once late and once on time, and the headline count rose by
      -- one for each duplicate. F18 asks who submitted -- a person, not a
      -- transport. Earliest real submission wins, because that is when they
      -- reported; a later reply elsewhere does not make them late.
      left join lateral (
        select ss.submitted, ss.late, ss.responded_at, ss.characters_written
        from submission_status ss
        where ss.profile_id = p.id and ss.cycle_id = ${cycleId}
        order by ss.responded_at is null, ss.responded_at asc
        limit 1
      ) s on true
      where p.org_id = (select org_id from profiles where id = ${actor})
        and p.status = 'active'
        -- Who is expected to file: everybody but the Chairman, who consumes
        -- reporting and does not produce it. HR and the Administrator both
        -- appear in the very list they chase, which is the point — a
        -- reporting rhythm its owners are exempt from is optional.
        and p.role <> 'executive'
      order by
        coalesce(s.submitted, false),
        s.late desc nulls last,
        d.name nulls last,
        p.full_name
    `,
  );
}
