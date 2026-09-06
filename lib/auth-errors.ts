/*
 * What a failed sign-in actually means, in the second person.
 *
 * Pure data, no imports — this is read on the server when building the
 * redirect and again by the client that renders it.
 *
 * Auth.js redirects to the configured error page (see auth.ts's `pages.error`)
 * with a short, stable code in `?error=` — "AccessDenied", "Configuration",
 * "OAuthAccountNotLinked" and so on — rather than a free-text message. Those
 * codes are written for whoever is integrating Auth.js, not for the person
 * looking at the sign-in screen, so this still translates them.
 */

export type AuthFailure = { title: string; detail: string };

const KNOWN: Record<string, AuthFailure> = {
  AccessDenied: {
    title: "Sign-in was cancelled",
    detail: "Nothing happened and nothing was changed. You can try again whenever you are ready.",
  },
  OAuthAccountNotLinked: {
    title: "That address already has an account",
    detail:
      "An account with this email already exists, created a different way. Sign in with email and password instead, or ask an administrator for help linking Microsoft to it.",
  },
  Configuration: {
    title: "Sign-in is not set up correctly",
    detail: "Microsoft sign-in is misconfigured on this deployment. Use email and password, or contact an administrator.",
  },
  Verification: {
    title: "That link has expired",
    detail: "Sign-in links are single-use and short-lived. Start again below and a fresh one will be sent.",
  },
  CredentialsSignin: {
    title: "That email and password do not match",
    detail: "Check both and try again.",
  },
};

export function explainAuthError(raw: string): AuthFailure {
  const known = KNOWN[raw];
  if (known) return known;

  /*
   * Anything unrecognised is shown as-is rather than replaced with a shrug.
   * A message we did not anticipate is still more use to the person reading it
   * — and to whoever they forward it to — than "something went wrong".
   */
  return { title: "Sign-in did not complete", detail: raw };
}
