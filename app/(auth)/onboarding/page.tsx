import { redirect } from "next/navigation";
import { currentIdentity, currentMembership } from "@/lib/auth";
import { homeFor } from "@/lib/nav";
import {
  departmentsForOrg,
  organizationsForDomain,
  pendingInvitationFor,
  previewInvitation,
} from "@/lib/onboarding";
import { OnboardingPanel } from "@/components/auth/onboarding-panel";

export const dynamic = "force-dynamic";

/*
 * The one screen that turns an identity into a membership.
 *
 * Three routes in, and the difference between them is who chose the role:
 *
 *   invitation   somebody with authority chose it before you arrived
 *   join         an organisation published your email domain — always staff
 *   create       you are founding an organisation, so you administer it
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; next?: string }>;
}) {
  const params = await searchParams;

  const identity = await currentIdentity();
  if (!identity) {
    redirect(
      params.invite ? `/login?invite=${params.invite}` : "/login",
    );
  }

  // Already placed: onboarding has nothing left to ask.
  const membership = await currentMembership(identity);
  if (membership) {
    if (membership.status === "pending") redirect("/pending");
    if (membership.status === "suspended") redirect("/login?suspended=1");
    redirect(homeFor(membership.role));
  }

  /*
   * The token first, then the address.
   *
   * A URL is the fragile part of an invitation, and when the token went
   * missing this page offered to found an organisation to somebody who had
   * been invited to join one. Falling back to the signed-in address closes
   * that regardless of how the token was lost — and the address is the safer
   * key, because Supabase has verified it and a URL parameter proves nothing.
   *
   * Ordering matters: an explicit token wins, so following a specific
   * invitation link still lands on that specific invitation even when the
   * address has another one open.
   */
  let token = params.invite ?? null;
  let invitation = token ? await previewInvitation(token) : null;

  if (!invitation) {
    const found = await pendingInvitationFor(identity.email);
    if (found) {
      token = found.token;
      invitation = found.preview;
    }
  }

  const joinable = invitation ? [] : await organizationsForDomain(identity.email);
  const departments =
    joinable.length === 1 ? await departmentsForOrg(joinable[0].slug) : [];

  return (
    <OnboardingPanel
      identity={{
        email: identity.email,
        name: identity.name,
        provider: identity.provider,
      }}
      token={token}
      invitation={invitation}
      joinable={joinable}
      departments={departments}
    />
  );
}
