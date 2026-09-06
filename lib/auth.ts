import { cache } from "react";
import { cookies } from "next/headers";
import { asService } from "./db";
import { auth as authjsSession } from "../auth";

/*
 * Who is signed in, and what they are in this organisation.
 *
 * Two providers behind one interface:
 *
 *   authjs    Real authentication. Microsoft Entra ID and email + password
 *             both arrive here as one `Identity`, because which button
 *             someone pressed is a detail of how they proved who they are —
 *             not a difference in who they then are. Auth.js (NextAuth v5)
 *             runs this against the same Postgres everything else talks to;
 *             see auth.ts and migration 0024.
 *
 *   dev       Asked for explicitly with NEXUS_FORCE_DEMO_AUTH=1. Falls back
 *             to the persona cookie so the app still runs on a clean machine
 *             with no environment configured at all. Never reachable in
 *             production: see assertProviderIsSafe().
 *
 * The split that matters is between IDENTITY and MEMBERSHIP.
 *
 *   Identity   proves you are a particular human. Owned by the auth provider.
 *   Membership says what you may do inside one organisation. Owned by us,
 *              enforced by RLS, and never taken from a token — an Entra claim
 *              cannot make somebody an executive here.
 *
 * That boundary is why signing in with a work Microsoft account does not by
 * itself grant any access at all: it gets you as far as onboarding.
 */

export type Identity = {
  userId: string;
  email: string;
  name: string | null;
  /** 'azure' | 'google' | 'email' | 'dev' */
  provider: string;
};

import type { OrgRole, MembershipStatus } from "./roles";
export type { OrgRole, MembershipStatus };

export type Membership = {
  profileId: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: OrgRole;
  status: MembershipStatus;
  fullName: string;
  departmentId: string | null;
  onboardingComplete: boolean;
  /** Null until they have finished the introduction. */
  welcomedAt: string | null;
};

const DEV_COOKIE = "nexus_persona";

export function authMode(): "authjs" | "dev" {
  /*
   * One deterministic override, read at runtime on the server.
   *
   * Auth.js needs nothing external to work — Credentials sign-in only needs
   * this app's own Postgres and AUTH_SECRET, both of which are configured in
   * every real environment — so unlike the old Supabase check, there is no
   * "nothing configured" fallback to reach for here. The persona switcher is
   * opt-in only, exactly the deliberate override the visual sweep asks for by
   * name.
   *
   * Not NEXT_PUBLIC_, so it never reaches a browser and cannot be used to
   * downgrade a real deployment from the client side.
   */
  if (process.env.NEXUS_FORCE_DEMO_AUTH === "1") return "dev";
  return "authjs";
}

/**
 * Refuse to run the persona shim in production.
 *
 * The dev provider trusts a cookie that names a profile id. That is exactly
 * what you want on a laptop with seeded data and a catastrophe on a real
 * deployment, where it would let anyone become the Chairman by editing a
 * cookie. Failing to boot is the correct response to that configuration.
 */
export function assertProviderIsSafe() {
  if (process.env.NODE_ENV !== "production") return;
  if (authMode() === "authjs") return;

  /*
   * One deliberate escape hatch, for running the real build locally — the
   * production server is how the interface gets verified without the dev
   * server's on-demand compilation racing the filesystem. It has to be asked
   * for by name; nothing about a normal deploy sets it.
   */
  if (process.env.NEXUS_ALLOW_DEMO_AUTH === "1") return;

  throw new Error(
    "NEXUS is running in demo/persona mode in a production build. Unset " +
      "NEXUS_FORCE_DEMO_AUTH, or set NEXUS_ALLOW_DEMO_AUTH=1 if this is " +
      "deliberately a demo build.",
  );
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

async function authjsIdentity(): Promise<Identity | null> {
  /*
   * `auth()` reads and verifies the session cookie itself — a JWT, signed
   * with AUTH_SECRET (see auth.ts's session strategy) — so there is no
   * separate "forged cookie" concern the old getUser()-over-getSession() note
   * was guarding against: an unsigned or tampered cookie fails verification
   * here and this simply returns no session.
   */
  const session = await authjsSession();
  const user = session?.user as
    | { id?: string; email?: string | null; name?: string | null; provider?: string }
    | undefined;
  if (!user?.id) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
    name: user.name ?? null,
    provider: user.provider ?? "credentials",
  };
}

/*
 * A sentinel that means "signed out" in dev.
 *
 * Without it the fallback below always resolves somebody, so /login and
 * /onboarding redirect away the instant you open them and the authentication
 * screens cannot be seen — or screenshotted — on a machine with no provider
 * configured. Which is every machine, until Entra is wired up.
 */
export const DEV_SIGNED_OUT = "signed-out";

/*
 * A signed-in person who belongs to no organisation.
 *
 * This is a real state — somebody authenticates with Microsoft and has no
 * profile yet — and it is the only one /onboarding renders for. Without a way
 * to reach it, that screen cannot be seen or screenshotted in the demo at all,
 * which is how it went unverified.
 */
export const DEV_STRANGER = "stranger";

async function devIdentity(): Promise<Identity | null> {
  const jar = await cookies();
  const profileId = jar.get(DEV_COOKIE)?.value;

  if (profileId === DEV_SIGNED_OUT) return null;

  if (profileId === DEV_STRANGER) {
    return {
      userId: "00000000-0000-0000-0000-0000000000ff",
      email: "newcomer@example.test",
      name: "Newcomer",
      provider: "dev",
    };
  }

  const rows = await asService(
    (sql) => sql<{
      user_id: string | null;
      email: string;
      full_name: string;
    }>`
      select p.user_id, p.email, p.full_name
      from profiles p
      where ${profileId ?? null}::uuid is not null and p.id = ${profileId ?? null}::uuid
      union all
      -- No cookie yet: fall back to the demo organisation's admin so a fresh
      -- clone opens on a working app rather than a login wall.
      select p.user_id, p.email, p.full_name
      from profiles p
      join organizations o on o.id = p.org_id
      where ${profileId ?? null}::uuid is null
        and o.slug = 'nexus-demo'
        and p.role = 'executive'
      limit 1
    `,
  );

  const row = rows[0];
  if (!row?.user_id) return null;

  return {
    userId: row.user_id,
    email: row.email,
    name: row.full_name,
    provider: "dev",
  };
}

/*
 * Memoized per request with React's `cache()`.
 *
 * Without it, every page under app/(app)/layout.tsx resolved identity a
 * second time — the layout calls this once via requireViewer(), and every
 * individual page called currentActorId() again, which runs the exact same
 * authjsIdentity()/devIdentity() branch a second time. In authjs mode that
 * verifies the session cookie again for no reason. `cache()` scopes the
 * memoization to one request; it never leaks across users or requests.
 */
export const currentIdentity = cache(async function currentIdentity(): Promise<
  Identity | null
> {
  return authMode() === "authjs" ? authjsIdentity() : devIdentity();
});

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

/**
 * What this identity is inside an organisation, if anything.
 *
 * Runs as the service role deliberately. RLS answers "what may this profile
 * see"; it cannot answer "does this profile exist", because the policies
 * themselves are written in terms of current_profile_id(). Resolving identity
 * to membership is the one lookup that has to happen outside the fence, and it
 * reads a fixed set of columns for exactly one user_id.
 *
 * Memoized per request — same reasoning as `currentIdentity()` above.
 */
export const currentMembership = cache(async function currentMembership(
  identity: Identity | null,
): Promise<Membership | null> {
  if (!identity) return null;

  const rows = await asService(
    (sql) => sql<Membership & { org_name: string; org_slug: string }>`
      select
        p.id            as "profileId",
        p.org_id        as "orgId",
        o.name          as "orgName",
        o.slug          as "orgSlug",
        p.role::text    as role,
        p.status::text  as status,
        p.full_name     as "fullName",
        p.department_id as "departmentId",
        o.onboarding_complete as "onboardingComplete",
        p.welcomed_at as "welcomedAt"
      from profiles p
      join organizations o on o.id = p.org_id
      where p.user_id = ${identity.userId}
    `,
  );

  return rows[0] ?? null;
});

export type Viewer = {
  identity: Identity;
  membership: Membership;
};

/** Identity plus membership, or null if either is missing. */
export async function currentViewer(): Promise<Viewer | null> {
  const identity = await currentIdentity();
  if (!identity) return null;
  const membership = await currentMembership(identity);
  if (!membership) return null;
  return { identity, membership };
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

/*
 * Re-exported from lib/roles.ts so server code can keep importing them from
 * here. Client components must import from lib/roles directly — this module
 * touches the database, and pulling it into a browser bundle brings the
 * Postgres driver with it.
 */
export {
  ROLE_LABEL,
  ROLE_BLURB,
  isChairman,
  isHr,
  canSeeOrg,
  canManagePeople,
  canLeadUnit,
  submitsStandups,
} from "./roles";
