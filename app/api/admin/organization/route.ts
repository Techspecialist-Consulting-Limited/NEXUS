import { NextResponse } from "next/server";
import { z } from "zod";
import { currentViewer } from "@/lib/auth";
import { hasAdministration } from "@/lib/capabilities";
import { organizationProfile, updateOrganizationProfile } from "@/lib/organization";
import { record } from "@/lib/audit";

/*
 * Edit the organisation profile.
 *
 * The capability check here is a courtesy that produces a clear 403 rather
 * than a silent no-op. The real boundary is `org_admin_write` in migration
 * 0006: the update runs through asActor, so a lead's request writes nothing
 * whatever this route decides.
 */

const body = z.object({
  name: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(64),
  industry: z.string().trim().max(80).nullable(),
  country: z.string().trim().max(80).nullable(),
  workingDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
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
  if (!hasAdministration(viewer.membership.role)) {
    return NextResponse.json(
      { error: "You do not have permission to change the organisation." },
      { status: 403 },
    );
  }

  const actor = viewer.membership.profileId;
  const before = await organizationProfile(actor);
  const ok = await updateOrganizationProfile(actor, parsed.data);

  if (!ok) {
    return NextResponse.json(
      { error: "The organisation could not be updated." },
      { status: 403 },
    );
  }

  /*
   * Named changes, not "profile updated". Six months later the useful line is
   * "renamed the organisation from X to Y", and a summary that does not say
   * what changed is a row nobody can act on.
   */
  const changes: string[] = [];
  if (before && before.name !== parsed.data.name) {
    changes.push(`renamed it from "${before.name}" to "${parsed.data.name}"`);
  }
  if (before && before.timezone !== parsed.data.timezone) {
    changes.push(`moved the timezone to ${parsed.data.timezone}`);
  }
  if (before && before.workingDays.join(",") !== parsed.data.workingDays.join(",")) {
    changes.push("changed the working days");
  }

  await record(
    actor,
    viewer.membership.fullName,
    "org.profile_updated",
    changes.length > 0
      ? `${viewer.membership.fullName} ${changes.join(", ")}.`
      : `${viewer.membership.fullName} updated the organisation profile.`,
    { kind: "organization", name: parsed.data.name },
  );

  return NextResponse.json({ ok: true });
}
