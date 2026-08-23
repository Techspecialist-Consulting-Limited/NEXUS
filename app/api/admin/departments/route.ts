import { NextResponse } from "next/server";
import { z } from "zod";
import { currentViewer } from "@/lib/auth";
import { hasAdministration } from "@/lib/capabilities";
import {
  createDepartment,
  listDepartmentsDetailed,
  setDepartmentArchived,
  updateDepartment,
} from "@/lib/departments";
import { record } from "@/lib/audit";

/*
 * Create, edit and archive units.
 *
 * There is no DELETE handler and there will not be one. A unit that has
 * existed for a quarter is referenced by every commitment and reconciliation
 * produced in it; removing it either takes that history or orphans it. See
 * migration 0017.
 */

async function admin() {
  const viewer = await currentViewer();
  if (!viewer || viewer.membership.status !== "active") return null;
  if (!hasAdministration(viewer.membership.role)) return null;
  return viewer.membership;
}

const createBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(280).nullable().default(null),
});

export async function POST(request: Request) {
  const me = await admin();
  if (!me) {
    return NextResponse.json(
      { error: "You do not have permission to manage units." },
      { status: 403 },
    );
  }

  const parsed = createBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A unit needs a name." }, { status: 400 });
  }

  const created = await createDepartment(
    me.profileId,
    parsed.data.name,
    parsed.data.description,
  );
  if (!created) {
    return NextResponse.json(
      { error: "That unit could not be created." },
      { status: 403 },
    );
  }

  await record(
    me.profileId,
    me.fullName,
    "department.created",
    `${me.fullName} created the unit ${created.name}.`,
    { kind: "department", id: created.id, name: created.name },
  );

  return NextResponse.json({ department: created });
}

const patchBody = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(280).nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const me = await admin();
  if (!me) {
    return NextResponse.json(
      { error: "You do not have permission to manage units." },
      { status: 403 },
    );
  }

  const parsed = patchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That request was not valid." }, { status: 400 });
  }
  const { id, archived, ...patch } = parsed.data;

  // Read before, so the audit line can name what actually changed.
  const before = (await listDepartmentsDetailed(me.profileId)).find((d) => d.id === id);
  if (!before) {
    return NextResponse.json({ error: "No such unit." }, { status: 404 });
  }

  let ok = true;
  if (Object.keys(patch).length > 0) {
    ok = await updateDepartment(me.profileId, id, patch);
  }
  if (ok && archived !== undefined) {
    ok = await setDepartmentArchived(me.profileId, id, archived);
  }

  if (!ok) {
    return NextResponse.json({ error: "That unit could not be updated." }, { status: 403 });
  }

  const after = (await listDepartmentsDetailed(me.profileId)).find((d) => d.id === id);

  if (archived !== undefined && archived !== Boolean(before.archived_at)) {
    await record(
      me.profileId,
      me.fullName,
      "department.archived",
      archived
        ? `${me.fullName} archived ${before.name}. Its reporting history is unchanged.`
        : `${me.fullName} restored ${before.name}.`,
      { kind: "department", id, name: before.name },
    );
  }
  if (patch.name && patch.name !== before.name) {
    await record(
      me.profileId,
      me.fullName,
      "department.renamed",
      `${me.fullName} renamed ${before.name} to ${patch.name}.`,
      { kind: "department", id, name: patch.name },
    );
  }
  if (patch.leadId !== undefined && patch.leadId !== before.lead_id) {
    await record(
      me.profileId,
      me.fullName,
      "department.lead_assigned",
      after?.lead_name
        ? `${me.fullName} made ${after.lead_name} lead of ${before.name}.`
        : `${me.fullName} removed the lead of ${before.name}.`,
      { kind: "department", id, name: before.name },
    );
  }

  return NextResponse.json({ department: after ?? null });
}
