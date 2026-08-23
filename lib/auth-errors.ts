/*
 * What a failed sign-in actually means, in the second person.
 *
 * Pure data, no imports — this is read on the server when building the
 * redirect and again by the client that renders it.
 *
 * WHY TRANSLATE AT ALL
 *
 * Supabase's messages are written for the developer integrating it, and one of
 * them is actively misleading here:
 *
 *   "PKCE code verifier not found in storage. This can happen if the auth flow
 *    was initiated in a different browser or device, or if the storage was
 *    cleared. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr
 *    on both the server and client to store the code verifier in cookies."
 *
 * We DO use @supabase/ssr on both sides. Shown to somebody trying to sign in
 * on their phone, that paragraph is advice they cannot act on about a library
 * they have never heard of — and it points at the wrong cause.
 *
 * The real one, almost always: the verifier is stored per ORIGIN. Start the
 * flow at one address, come back at another, and the second address has no
 * verifier to exchange with. Which happens when Supabase declines the
 * redirect it was given and falls back to the project's Site URL.
 */

export type AuthFailure = { title: string; detail: string };

export function explainAuthError(raw: string): AuthFailure {
  const m = raw.toLowerCase();

  if (m.includes("code verifier") || m.includes("code challenge")) {
    return {
      title: "Sign-in came back to a different address",
      detail:
        "You started signing in at one address and were returned to another, so the sign-in could not be completed. " +
        "That usually means the address you are using is not on this project's sign-in allowlist. " +
        "Try again from here, or ask an administrator to add this address.",
    };
  }

  if (m.includes("expired") || m.includes("invalid or has expired")) {
    return {
      title: "That link has expired",
      detail: "Sign-in links are single-use and short-lived. Start again below and a fresh one will be sent.",
    };
  }

  if (m.includes("access_denied") || m.includes("cancelled") || m.includes("canceled")) {
    return {
      title: "Sign-in was cancelled",
      detail: "Nothing happened and nothing was changed. You can try again whenever you are ready.",
    };
  }

  if (m.includes("already registered") || m.includes("already exists")) {
    return {
      title: "That address already has an account",
      detail: "Sign in with it instead of creating a second one.",
    };
  }

  if (m.includes("invalid login credentials")) {
    return {
      title: "That email and password do not match",
      detail: "Check both and try again.",
    };
  }

  /*
   * Anything unrecognised is shown as-is rather than replaced with a shrug.
   * A message we did not anticipate is still more use to the person reading it
   * — and to whoever they forward it to — than "something went wrong".
   */
  return { title: "Sign-in did not complete", detail: raw };
}
