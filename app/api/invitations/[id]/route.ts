import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/session";
import { canManagePeople } from "@/lib/auth";
import { revokeInvitation } from "@/lib/team";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { membership } = await requireViewer();
  if (!canManagePeople(membership.role)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const ok = await revokeInvitation(membership.profileId, id);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Not found." }, { status: 404 });
}
