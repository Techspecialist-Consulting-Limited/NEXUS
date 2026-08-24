import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-env";
import { onboardingDestination } from "@/lib/onboarding";

/*
 * OAuth landing point for Microsoft Entra ID and Google.
 *
 * Supabase sends the browser back here with a one-time code, which is
 * exchanged for a session server-side. The code is the only thing that crosses
 * the network in the URL; the session cookies are set here, HTTP-only, so the
 * access token never touches client JavaScript.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  /*
   * Email confirmation links can arrive in either of two shapes depending on
   * how the project is configured: the PKCE `?code=` exchange, or a
   * `?token_hash=&type=` one-time token. Handling only the first means signup
   * confirmation silently dead-ends on some projects, which looks to the
   * person like the link was broken.
   */
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type");
  const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  // Only relative paths. An absolute `next` would make this an open redirect.
  const raw = url.searchParams.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error)}`, url.origin),
    );
  }
  if (!code && !tokenHash) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const jar = await cookies();
  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (list) => {
          for (const { name, value, options } of list) jar.set(name, value, options);
        },
      },
    },
  );

  const { error: exchangeError } = tokenHash
    ? await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: (otpType ?? "email") as "email" | "signup" | "recovery" | "invite" | "magiclink",
      })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (exchangeError) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(exchangeError.message)}`, url.origin),
    );
  }

  /*
   * Straight to /onboarding rather than to `next`. The person is now
   * authenticated but may have no membership at all, and onboarding is the
   * only screen that can tell the difference. It forwards them onward once it
   * knows.
   *
   * Unless `next` is ALREADY an onboarding URL — an invitation carries its
   * token there, and wrapping it in another ?next= hides that token from the
   * page that has to read it. See onboardingDestination().
   */
  return NextResponse.redirect(new URL(onboardingDestination(next), url.origin));
}
