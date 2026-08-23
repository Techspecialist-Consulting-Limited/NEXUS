import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/session";
import { canManagePeople } from "@/lib/auth";
import { createInvitation } from "@/lib/team";
import { emailConfigured, invitationEmail, send } from "@/lib/email";

const body = z.object({
  email: z.string().email().max(200),
  role: z.enum(["staff", "lead", "hr", "executive", "admin"]),
  departmentId: z.string().uuid().nullable().optional(),
  title: z.string().max(120).nullable().optional(),
});

export async function POST(request: Request) {
  const { membership } = await requireViewer();
  if (!canManagePeople(membership.role)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That request was not valid." }, { status: 400 });
  }

  const { email, role, departmentId, title } = parsed.data;
  const invite = await createInvitation(
    membership.profileId,
    email,
    role,
    departmentId ?? null,
    title ?? null,
  );

  if (!invite) {
    return NextResponse.json({ error: "Could not create that invitation." }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const link = `${origin}/onboarding?invite=${invite.token}`;

  /*
   * Send it, and say honestly whether it went.
   *
   * The link is returned either way. With no mail configured that is the only
   * way the invitation reaches anybody; with mail configured it is still
   * useful, because delivery can fail for reasons the sender needs to see —
   * an unverified domain, or Resend's test sender, which will only deliver to
   * the account owner's own address.
   */
  const { subject, html, text } = invitationEmail({
    orgName: membership.orgName,
    inviterName: membership.fullName,
    role,
    departmentName: null,
    link,
  });

  const result = emailConfigured()
    ? await send({ to: email, subject, html, text })
    : ({ delivered: false, reason: "Email is not configured on this server." } as const);

  return NextResponse.json({
    ok: true,
    id: invite.id,
    link,
    delivered: result.delivered,
    deliveryNote: result.delivered ? null : result.reason,
  });
}
