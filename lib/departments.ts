import { asActor } from "./db";

/*
 * Unit management.
 *
 * Every write goes through asActor, so `departments_write` — Administrator
 * only, since 0017 — is what actually decides whether a change happens. A
 * lead's attempt updates no row and returns nothing, without any React
 * component having to know that.
 *
 * THERE IS NO DELETE. See migration 0017: a unit that has existed for a
 * quarter is referenced by every commitment and reconciliation produced in
 * that time, and removing it either takes the history with it or orphans it.
 * `archive` is the whole of the destructive surface.
 */

export type DepartmentRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  lead_id: string | null;
  lead_name: string | null;
  member_count: number;
  archived_at: string | null;
};

export async function listDepartmentsDetailed(
  actor: string,
): Promise<DepartmentRow[]> {
  return asActor(
    actor,
    (sql) => sql<DepartmentRow>`
      select d.id, d.name, d.slug, d.description, d.color, d.lead_id,
             l.full_name as lead_name,
             (select count(*)::int from profiles m
               where m.department_id = d.id and m.status = 'active') as member_count,
             d.archived_at
      from departments d
      left join profiles l on l.id = d.lead_id
      where d.org_id = (select org_id from profiles where id = ${actor})
      -- Archived last, then alphabetical. A retired unit is still findable,
      -- just never in the way.
      order by (d.archived_at is not null), d.name
    `,
  );
}

/** A slug that is unique within the organisation. */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "unit";
}

export async function createDepartment(
  actor: string,
  name: string,
  description: string | null,
): Promise<DepartmentRow | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const rows = await asActor(
    actor,
    (sql) => sql<{ id: string }>`
      insert into departments (org_id, name, slug, description)
      values (
        (select org_id from profiles where id = ${actor}),
        ${trimmed},
        /*
         * De-collide in SQL rather than in a read-then-write. Two admins
         * creating "Operations" at the same moment both read "free" and one
         * insert then violates the unique index; appending the row count makes
         * the second attempt land beside the first instead of failing.
         */
        ${slugify(trimmed)} || coalesce(
          nullif((select '-' || count(*)::text from departments
                   where org_id = (select org_id from profiles where id = ${actor})
                     and slug like ${slugify(trimmed) + "%"}), '-0'), ''),
        ${description?.trim() || null}
      )
      returning id
    `,
  );

  if (rows.length === 0) return null;
  const created = await listDepartmentsDetailed(actor);
  return created.find((d) => d.id === rows[0].id) ?? null;
}

export async function updateDepartment(
  actor: string,
  id: string,
  patch: { name?: string; description?: string | null; leadId?: string | null },
): Promise<boolean> {
  /*
   * A lead must be somebody in this organisation. Checked in the statement
   * rather than beforehand, so there is no window between the check and the
   * write — and so an id from another tenant simply matches nothing.
   */
  const rows = await asActor(
    actor,
    (sql) => sql<{ id: string }>`
      update departments d
         set name        = coalesce(${patch.name?.trim() || null}, d.name),
             description = case when ${patch.description !== undefined}
                                then ${patch.description?.trim() || null}
                                else d.description end,
             lead_id     = case when ${patch.leadId !== undefined}
                                then (select p.id from profiles p
                                       where p.id = ${patch.leadId ?? null}
                                         and p.org_id = d.org_id)
                                else d.lead_id end,
             updated_at  = now()
       where d.id = ${id}
         and d.org_id = (select org_id from profiles where id = ${actor})
      returning d.id
    `,
  );
  return rows.length > 0;
}

/**
 * Retire a unit, or bring one back.
 *
 * People are NOT moved out. Somebody in an archived unit keeps their history
 * and their lead; the admin decides where they go, because moving fourteen
 * people somewhere automatically is a decision nobody asked for.
 */
export async function setDepartmentArchived(
  actor: string,
  id: string,
  archived: boolean,
): Promise<boolean> {
  const rows = await asActor(
    actor,
    (sql) => sql<{ id: string }>`
      update departments
         set archived_at = ${archived ? new Date().toISOString() : null},
             updated_at  = now()
       where id = ${id}
         and org_id = (select org_id from profiles where id = ${actor})
      returning id
    `,
  );
  return rows.length > 0;
}

export type DepartmentMember = {
  id: string;
  full_name: string;
  role: string;
  status: string;
  department_id: string | null;
};

/** Everyone in the organisation, for assignment and for the lead picker. */
export async function assignableMembers(actor: string): Promise<DepartmentMember[]> {
  return asActor(
    actor,
    (sql) => sql<DepartmentMember>`
      select id, full_name, role::text as role, status::text as status, department_id
      from profiles
      where org_id = (select org_id from profiles where id = ${actor})
        and status in ('active', 'pending')
      order by full_name
    `,
  );
}
