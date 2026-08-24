import { asService } from "./db";
import type { Identity, OrgRole } from "./auth";

/*
 * Joining an organisation.
 *
 * Every path here ends in a profile row, and the role on that row is decided
 * by exactly one of three things:
 *
 *   founder      you created the organisation, so you administer it
 *   invitation   somebody with authority chose your role before you arrived
 *   self-signup  'staff', always, with what you asked for recorded separately
 *
 * The functions themselves live in migration 0008 as SECURITY DEFINER, because
 * at this moment the caller has no profile and therefore no RLS foothold. They
 * are the only place in the product where a role is assigned, which is what
 * makes that rule auditable rather than aspirational.
 */

export type InvitePreview = {
  orgName: string;
  orgSlug: string;
  email: string;
  role: OrgRole;
  departmentName: string | null;
  invitedBy: string | null;
  expiresAt: string;
};

/**
 * Look up an invitation for the acceptance screen.
 *
 * Returns the address the invitation was issued to so the page can say "this
 * was sent to a@b.com" when the signed-in account is somebody else — the most
 * common confusion in an invite flow, and one a generic error cannot explain.
 */
export async function previewInvitation(token: string): Promise<InvitePreview | null> {
  const rows = await asService(
    (sql) => sql<InvitePreview>`
      select
        o.name                as "orgName",
        o.slug                as "orgSlug",
        i.email               as email,
        i.role::text          as role,
        d.name                as "departmentName",
        inviter.full_name     as "invitedBy",
        i.expires_at          as "expiresAt"
      from invitations i
      join organizations o on o.id = i.org_id
      left join departments d on d.id = i.department_id
      left join profiles inviter on inviter.id = i.invited_by
      where i.token = ${token}
        and i.accepted_at is null
        and i.revoked_at is null
        and i.expires_at > now()
    `,
  );
  return rows[0] ?? null;
}

export async function createOrganization(
  identity: Identity,
  orgName: string,
  fullName: string,
  timezone = "Africa/Lagos",
): Promise<string> {
  const rows = await asService(
    (sql) => sql<{ create_organization: string }>`
      select create_organization(
        ${identity.userId}::uuid,
        ${orgName},
        ${fullName},
        ${identity.email},
        ${timezone},
        ${identity.provider}
      )
    `,
  );
  return rows[0].create_organization;
}

export async function acceptInvitation(
  identity: Identity,
  token: string,
  fullName: string,
): Promise<string> {
  const rows = await asService(
    (sql) => sql<{ accept_invitation: string }>`
      select accept_invitation(
        ${identity.userId}::uuid,
        ${token},
        ${fullName},
        ${identity.email},
        ${identity.provider}
      )
    `,
  );
  return rows[0].accept_invitation;
}

export async function requestToJoin(
  identity: Identity,
  orgSlug: string,
  fullName: string,
  departmentId: string | null,
  requestedRole: OrgRole,
): Promise<string> {
  const rows = await asService(
    (sql) => sql<{ request_to_join: string }>`
      select request_to_join(
        ${identity.userId}::uuid,
        ${orgSlug},
        ${fullName},
        ${identity.email},
        ${departmentId}::uuid,
        ${requestedRole}::org_role,
        ${identity.provider}
      )
    `,
  );
  return rows[0].request_to_join;
}

/** Organisations this email address may join without an invitation. */
export async function organizationsForDomain(email: string) {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!domain) return [];

  return asService(
    (sql) => sql<{ id: string; name: string; slug: string }>`
      select id, name, slug
      from organizations
      where ${domain} = any (allowed_domains)
      order by name
    `,
  );
}

/** Departments a joiner can pick from, before they have any RLS foothold. */
export async function departmentsForOrg(orgSlug: string) {
  return asService(
    (sql) => sql<{ id: string; name: string; color: string }>`
      select d.id, d.name, d.color
      from departments d
      join organizations o on o.id = d.org_id
      where o.slug = ${orgSlug}
      order by d.name
    `,
  );
}

/**
 * Where /auth/callback should send somebody once their session exists.
 *
 * THE BUG THIS FIXES. The callback always redirected to
 * `/onboarding?next=<next>`, which is right for an ordinary sign-in: the
 * person is authenticated but may have no membership, and onboarding is the
 * only screen that can tell the difference.
 *
 * It is wrong for an invitation. There, `next` is ALREADY an onboarding URL
 * carrying the invite token — `/onboarding?invite=abc` — and wrapping it in
 * another `?next=` hid the token from the only page that reads it. The invited
 * person set a password, confirmed their email, and was then shown "create an
 * organisation" instead of "join Techspecialist". Pressing Back revealed the
 * correct screen, because the pre-callback URL still had the token on it.
 *
 * It only fires when the project requires email confirmation. With
 * confirmation off, signUp returns a session immediately and the browser goes
 * straight to `target` without passing through here at all — which is why it
 * survived every test of the invitation flow.
 *
 * Relative paths only. An absolute `next` here would make the callback an
 * open redirect, which is a phishing primitive.
 */
export function onboardingDestination(rawNext: string | null): string {
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  // Already an onboarding URL: it carries its own context. Use it as given.
  if (next === "/onboarding" || next.startsWith("/onboarding?")) return next;

  return `/onboarding?next=${encodeURIComponent(next)}`;
}
