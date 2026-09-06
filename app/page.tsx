import { redirect } from "next/navigation";
import { currentIdentity, currentMembership } from "@/lib/auth";
import { homeFor } from "@/lib/nav";

/*
 * GUIDE Implementation Mandate: the first screen is the product, never a
 * marketing page. Route straight to the surface this person actually uses —
 * the Chairman to Command, HR to reporting compliance, everyone else to their
 * own week.
 */
export default async function RootPage() {
  /*
   * THE OAUTH-CODE-ON-ROOT RECOVERY THIS PAGE USED TO DO IS GONE ON PURPOSE.
   *
   * That existed because Supabase could decline the `redirectTo` it was given
   * and fall back to the project's bare Site URL, leaving a code stranded on
   * `/?code=…` with no exchange and no session. Auth.js does not have that
   * failure mode: its redirect URI is registered directly as
   * `/api/auth/callback/microsoft-entra-id` in the Azure app registration
   * itself (see auth.ts), not derived from a per-request `redirectTo` that
   * could be rejected — so a code has nowhere else to land, and forwarding
   * one from here would only ever be forwarding a stale link to a route that
   * no longer exists.
   */
  const identity = await currentIdentity();
  if (!identity) redirect("/login");

  const membership = await currentMembership(identity);
  if (!membership) redirect("/onboarding");
  if (membership.status === "pending") redirect("/pending");
  if (membership.status === "suspended") redirect("/login?suspended=1");

  redirect(homeFor(membership.role));
}
