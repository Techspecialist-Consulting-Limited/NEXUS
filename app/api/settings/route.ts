import { NextResponse } from "next/server";
import { z } from "zod";
import { currentViewer } from "@/lib/auth";
import { updatePersonalSettings } from "@/lib/profile-settings";

/*
 * Your own settings.
 *
 * The schema is the security surface here. `role`, `status`, `departmentId`
 * and `orgId` are absent and always will be: those are somebody else's
 * decision about you, and a settings endpoint that accepted them would be the
 * whole invitation model defeated by a form post.
 *
 * `profiles_update_self` restricts the row to your own, and the
 * `profiles_guard_role` trigger from 0008 refuses a role or status change from
 * anybody who is not an admin. Neither is relied on alone.
 */

const body = z.object({
  fullName: z.string().trim().min(1).max(120),
  title: z.string().trim().max(80).nullable(),
  timezone: z.string().trim().min(1).max(64),
  quietHoursStart: z.number().int().min(0).max(23),
  quietHoursEnd: z.number().int().min(0).max(23),
  notifications: z.object({
    nudges: z.boolean(),
    weeklyDigest: z.boolean(),
    email: z.boolean(),
    inApp: z.boolean(),
  }),
});

export async function PATCH(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Some of those values could not be read. Check the form and try again." },
      { status: 400 },
    );
  }

  const viewer = await currentViewer();
  if (!viewer || viewer.membership.status !== "active") {
    return NextResponse.json({ error: "You are not signed in." }, { status: 401 });
  }

  const ok = await updatePersonalSettings(viewer.membership.profileId, parsed.data);
  if (!ok) {
    return NextResponse.json(
      { error: "Your settings could not be saved." },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true });
}
