import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asService } from "./db";
import { currentViewer, type Viewer } from "./auth";

/*
 * The signed-in person, for pages.
 *
 * Everything downstream asks one question — "who is the actor" — and RLS does
 * the rest. That was true when this was a persona cookie and it stays true now
 * that a real provider sits behind it, which is the point: swapping how
 * somebody proves who they are touched this file and nothing else.
 */

const DEV_COOKIE = "nexus_persona";

/** The profile id every query runs as. Redirects out if there isn't one. */
export async function currentActorId(): Promise<string> {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");

  if (viewer.membership.status === "pending") redirect("/pending");
  if (viewer.membership.status === "suspended") redirect("/login?suspended=1");

  return viewer.membership.profileId;
}

/** Identity + membership, for pages that need the role or the org. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  if (viewer.membership.status === "pending") redirect("/pending");
  if (viewer.membership.status === "suspended") redirect("/login?suspended=1");
  return viewer;
}

/**
 * Switch seats in local development.
 *
 * Only meaningful for the dev provider. With Supabase configured the persona
 * cookie is ignored entirely, so leaving this wired up cannot become a way
 * around real authentication.
 */
export async function setActor(profileId: string) {
  const jar = await cookies();
  jar.set(DEV_COOKIE, profileId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Every persona the demo switcher may offer. Dev only. */
export async function demoPersonas() {
  return asService(
    (sql) => sql<{
      id: string;
      full_name: string;
      role: string;
      department_name: string | null;
    }>`
      select p.id, p.full_name, p.role::text as role, d.name as department_name
      from profiles p
      left join departments d on d.id = p.department_id
      join organizations o on o.id = p.org_id
      where o.slug = 'nexus-demo' and p.status = 'active'
      order by
        case p.role
          when 'executive' then 0 when 'admin' then 1 when 'hr' then 2
          when 'lead' then 3 else 4 end,
        d.name nulls first,
        p.full_name
    `,
  );
}

export const PERSONA_COOKIE = DEV_COOKIE;
