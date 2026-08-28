import { NextResponse } from "next/server";
import { z } from "zod";
import { currentViewer } from "@/lib/auth";
import { hasAdministration } from "@/lib/capabilities";
import { deleteOrganization, findOrganization } from "@/lib/organizations";
import { record } from "@/lib/audit";

/*
 * Delete an organisation, and everything in it.
 *
 * THIS IS THE ONLY IRREVERSIBLE ACT IN NEXUS. Everything else archives, marks
 * inactive, or supersedes; migration 0017 replaced the one other destructive
 * operation with `archived_at` for exactly that reason. This one is real: a
 * cascade from `organizations` takes profiles, departments, cycles,
 * check-ins, commitments, reconciliations, insights, digests, notifications,
 * invitations and the audit log with it, and nothing keeps a copy.
 *
 * It exists because a pilot has to be torn down and rebuilt, and the
 * alternative was hand-written SQL against production every time.
 *
 * THREE THINGS STAND IN FRONT OF IT:
 *
 *   1. the caller must be signed in, active, and hold administration
 *      capability;
 *   2. they must send the organisation's exact name back, so a stray request
 *      cannot delete anything;
 *   3. the deletion is recorded in the caller's OWN audit log before it runs,
 *      because the target's log is about to cease existing.
 *
 * WHAT DOES NOT STAND IN FRONT OF IT, AND MUST BEFORE THIS SHIPS BROADLY:
 * an administrator of one organisation can delete another. lib/organizations.ts
 * reads as the service role and deliberately ignores row-level security, since
 * the page's whole purpose is to list organisations the caller is not in. That
 * is a pilot-stage decision. It is not a multi-tenant one.
 */

const body = z.object({
  orgId: z.string().uuid(),
  /** The organisation's name, typed by a human. Must match exactly. */
  confirmName: z.string().min(1).max(200),
  /** Also remove the sign-in accounts of its people. Off by default. */
  dropAuth: z.boolean().optional(),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That request could not be read." },
      { status: 400 },
    );
  }

  const viewer = await currentViewer();
  if (!viewer || viewer.membership.status !== "active") {
    return NextResponse.json({ error: "You are not signed in." }, { status: 401 });
  }
  if (!hasAdministration(viewer.membership.role)) {
    return NextResponse.json(
      { error: "You do not have permission to delete an organisation." },
      { status: 403 },
    );
  }

  const { orgId, confirmName, dropAuth } = parsed.data;

  const target = await findOrganization(orgId);
  if (!target) {
    return NextResponse.json(
      { error: "That organisation no longer exists." },
      { status: 404 },
    );
  }

  /*
   * Exact, after trimming the whitespace a paste brings with it. Not
   * case-insensitive: the point of the gesture is that somebody read the name
   * and typed it, and a checkbox would not be that.
   */
  if (confirmName.trim() !== target.name) {
    return NextResponse.json(
      {
        error: `Type the organisation's name exactly to confirm: ${target.name}`,
      },
      { status: 400 },
    );
  }

  /*
   * Recorded BEFORE, and in the caller's own organisation.
   *
   * The target's audit log is inside the cascade. Writing there would delete
   * the record of the deletion along with everything else, which is the one
   * entry that most needs to survive.
   */
  await record(
    viewer.membership.profileId,
    viewer.membership.fullName,
    "organization.deleted",
    `Deleted the organisation ${target.name} and everything in it` +
      (dropAuth ? ", including its sign-in accounts." : "."),
    { kind: "organization", id: target.id, name: target.name },
  );

  const receipt = await deleteOrganization(orgId, { dropAuth });
  if (!receipt) {
    return NextResponse.json(
      { error: "That organisation no longer exists." },
      { status: 404 },
    );
  }

  /*
   * Whether the caller just deleted the ground they were standing on. The
   * client needs to know: their profile is gone, every page will bounce them,
   * and the honest next step is to sign in again and start an organisation.
   */
  const deletedSelf = orgId === viewer.membership.orgId;

  return NextResponse.json({ receipt, deletedSelf });
}
