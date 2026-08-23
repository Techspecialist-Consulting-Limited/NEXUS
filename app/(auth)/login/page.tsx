import { redirect } from "next/navigation";
import { authMode, currentIdentity, currentMembership } from "@/lib/auth";
import { enabledProviders } from "@/lib/supabase-env";
import { previewInvitation } from "@/lib/onboarding";
import { homeFor } from "@/lib/nav";
import { explainAuthError } from "@/lib/auth-errors";
import { SignInPanel } from "@/components/auth/sign-in-panel";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    suspended?: string;
    invite?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;

  // Already signed in and placed? There is nothing to do here.
  const identity = await currentIdentity();
  if (identity) {
    const membership = await currentMembership(identity);
    if (membership?.status === "active") redirect(homeFor(membership.role));
    if (membership?.status === "pending") redirect("/pending");
    redirect(params.invite ? `/onboarding?invite=${params.invite}` : "/onboarding");
  }

  /*
   * Look the invitation up here, so the sign-in screen can be about the
   * invitation rather than about signing in.
   *
   * Somebody arriving from an invitation email has already proved they own
   * that address by opening the link. Presenting them a generic sign-in form
   * and asking them to create an account first is backwards: we know who they
   * are, we know their address, and the only thing missing is a password.
   */
  const invitation = params.invite ? await previewInvitation(params.invite) : null;

  /*
   * `?error=` was arriving here and being dropped on the floor.
   *
   * /auth/callback redirects to /login?error=… whenever a code cannot be
   * exchanged, and this page rendered the ordinary sign-in screen as though
   * nothing had happened. Somebody who had just authenticated with Microsoft
   * and been silently returned to the sign-in form had no way to know whether
   * they had done something wrong, whether it had worked, or whether to try
   * again — which is the least actionable failure an interface can produce.
   */
  const failure = params.error ? explainAuthError(params.error) : null;

  const notice = failure
    ? `${failure.title}. ${failure.detail}`
    : params.suspended
      ? "That account has been suspended. Your history is retained — an administrator can restore access."
      : params.invite && !invitation
        ? "That invitation link is no longer valid. Ask whoever invited you to send a new one."
        : null;

  const providers = await enabledProviders();

  return (
    <SignInPanel
      mode={authMode()}
      next={params.next ?? null}
      devEnabled
      notice={notice}
      providers={providers}
      invitation={
        invitation
          ? {
              token: params.invite!,
              orgName: invitation.orgName,
              email: invitation.email,
              role: invitation.role,
              invitedBy: invitation.invitedBy,
            }
          : null
      }
    />
  );
}
