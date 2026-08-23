import { redirect } from "next/navigation";
import { currentIdentity, currentMembership } from "@/lib/auth";
import { homeFor } from "@/lib/nav";

/*
 * GUIDE Implementation Mandate: the first screen is the product, never a
 * marketing page. Route straight to the surface this person actually uses —
 * the Chairman to Command, HR to reporting compliance, everyone else to their
 * own week.
 */
export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  /*
   * An OAuth code that landed on the root instead of /auth/callback.
   *
   * This happens when Supabase declines the `redirectTo` it was given — the
   * origin is not on the project's Redirect URLs allowlist — and falls back to
   * the project's Site URL, which is the bare root. The browser then sits on
   * `/?code=…` and nothing happens at all: the code is never exchanged, no
   * session is created, and the person is bounced to /login with no
   * explanation, having done everything right.
   *
   * Forwarding it means the sign-in completes wherever the landing origin is
   * actually reachable. It does not paper over a misconfigured allowlist —
   * when the fallback origin is somewhere the person's browser cannot reach
   * (a tunnel session landing on localhost, say) nothing can rescue that from
   * here — but it turns the common case from a dead end into a sign-in.
   *
   * `next` is passed through untouched; /auth/callback is the thing that
   * refuses an absolute one, and duplicating that check here would be two
   * places to get an open redirect wrong.
   */
  const code = first(params.code);
  const tokenHash = first(params.token_hash);
  if (code || tokenHash) {
    const forward = new URLSearchParams();
    if (code) forward.set("code", code);
    if (tokenHash) forward.set("token_hash", tokenHash);
    const type = first(params.type);
    if (type) forward.set("type", type);
    const next = first(params.next);
    if (next) forward.set("next", next);
    redirect(`/auth/callback?${forward.toString()}`);
  }

  /*
   * An error the provider handed back to the root for the same reason. Shown
   * rather than swallowed: "sign-in did nothing" is the least actionable
   * report a person can make.
   */
  const error = first(params.error_description) ?? first(params.error);
  if (error) redirect(`/login?error=${encodeURIComponent(error)}`);

  const identity = await currentIdentity();
  if (!identity) redirect("/login");

  const membership = await currentMembership(identity);
  if (!membership) redirect("/onboarding");
  if (membership.status === "pending") redirect("/pending");
  if (membership.status === "suspended") redirect("/login?suspended=1");

  redirect(homeFor(membership.role));
}

/** A query parameter may arrive repeated; the first one is the answer. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
