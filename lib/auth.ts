import { cookies } from "next/headers";
import { asService } from "./db";
import { SUPABASE_KEY, SUPABASE_URL, hasSupabase } from "./supabase-env";

/*
 * Who is signed in, and what they are in this organisation.
 *
 * Two providers behind one interface:
 *
 *   supabase  Real authentication. Microsoft Entra ID, Google, and
 *             email + password all arrive here as one `Identity`, because
 *             which button someone pressed is a detail of how they proved who
 *             they are — not a difference in who they then are.
 *
 *   dev       No credentials configured. Falls back to the persona cookie so
 *             the app still runs on a clean machine. Never reachable in
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

export function authMode(): "supabase" | "dev" {
  /*
   * One deterministic override, read at runtime on the server.
   *
   * Blanking NEXT_PUBLIC_SUPABASE_* to force demo mode does not work: those
   * are inlined into the client bundle at build time, and Next re-applies
   * .env.local over the process environment anyway. The visual sweep needs the
   * seeded demo org and the persona switcher regardless of what else is
   * configured, so it asks for it by name rather than trying to win a fight
   * over environment precedence.
   *
   * Not NEXT_PUBLIC_, so it never reaches a browser and cannot be used to
   * downgrade a real deployment from the client side.
   */
  if (process.env.NEXUS_FORCE_DEMO_AUTH === "1") return "dev";
  return hasSupabase ? "supabase" : "dev";
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
  if (authMode() === "supabase") return;

  /*
   * One deliberate escape hatch, for running the real build locally — the
   * production server is how the interface gets verified without the dev
   * server's on-demand compilation racing the filesystem. It has to be asked
   * for by name; nothing about a normal deploy sets it.
   */
  if (process.env.NEXUS_ALLOW_DEMO_AUTH === "1") return;

  throw new Error(
    "NEXUS is configured with no authentication provider. Set " +
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or set " +
      "NEXUS_ALLOW_DEMO_AUTH=1 if this is deliberately a demo build.",
  );
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

async function supabaseIdentity(): Promise<Identity | null> {
  const { createServerClient } = await import("@supabase/ssr");
  const jar = await cookies();

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) jar.set(name, value, options);
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Middleware refreshes the session instead.
          }
        },
      },
    },
  );

  /*
   * getUser(), never getSession(). getSession() returns whatever the cookie
   * claims without checking it, so a forged cookie would be believed. getUser()
   * validates against the auth server.
   */
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const u = data.user;
  return {
    userId: u.id,
    email: u.email ?? "",
    name:
      (u.user_metadata?.full_name as string | undefined) ??
      (u.user_metadata?.name as string | undefined) ??
      null,
    provider: u.app_metadata?.provider ?? "email",
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

export async function currentIdentity(): Promise<Identity | null> {
  return authMode() === "supabase" ? supabaseIdentity() : devIdentity();
}

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
 */
export async function currentMembership(
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
}

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
