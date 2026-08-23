import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/session";
import { canManagePeople } from "@/lib/auth";
import { updateMember } from "@/lib/team";

const body = z.object({
  role: z.enum(["staff", "lead", "hr", "executive", "admin"]).optional(),
  status: z.enum(["invited", "pending", "active", "suspended"]).optional(),
  departmentId: z.string().uuid().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { membership } = await requireViewer();

  if (!canManagePeople(membership.role)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  /*
   * An administrator cannot demote or suspend themselves.
   *
   * Not paternalism — it is the only thing standing between a misclick and an
   * organisation with no one able to administer it, which nobody inside the
   * product can then repair.
   */
  if (id === membership.profileId) {
    return NextResponse.json(
      { error: "You cannot change your own role or access." },
      { status: 400 },
    );
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That request was not valid." }, { status: 400 });
  }

  try {
    const ok = await updateMember(membership.profileId, id, parsed.data);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Not found." }, { status: 404 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    return NextResponse.json(
      { error: /only an admin/i.test(message) ? message : "That change was refused." },
      { status: 403 },
    );
  }
}
