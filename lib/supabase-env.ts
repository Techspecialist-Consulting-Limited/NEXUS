/*
 * Supabase connection details, resolved from either key naming scheme.
 *
 * Supabase replaced the legacy `anon` key with a `publishable` key
 * (sb_publishable_...). Both are browser-safe and both go in the same client
 * argument, but projects created at different times hand you different
 * variable names — and a mismatch fails as "no provider configured", which
 * looks like a decision rather than a typo.
 *
 * Kept dependency-free so client and server can both import it.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** The publishable (or legacy anon) key. Safe to send to a browser. */
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

/*
 * Which sign-in methods the project actually has switched on.
 *
 * Supabase exposes this at /auth/v1/settings. Reading it means the sign-in
 * screen offers only what will work: a "Continue with Microsoft" button on a
 * project where Azure is disabled does not fail gracefully, it fails with
 * "Unsupported provider" after a full redirect — and the person is left
 * assuming their account is the problem.
 *
 * Cached for a minute. Enabling a provider is a dashboard action, not a
 * per-request one, and this sits in front of every visit to /login.
 */
export type EnabledProviders = {
  azure: boolean;
  google: boolean;
  email: boolean;
};

let cached: { at: number; value: EnabledProviders } | null = null;

export async function enabledProviders(): Promise<EnabledProviders> {
  const fallback: EnabledProviders = { azure: false, google: false, email: true };
  if (!hasSupabase) return fallback;

  if (cached && Date.now() - cached.at < 60_000) return cached.value;

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_KEY },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) return fallback;

    const data = (await res.json()) as {
      external?: Record<string, boolean>;
      external_email_enabled?: boolean;
    };
    const ext = data.external ?? {};

    const value: EnabledProviders = {
      azure: Boolean(ext.azure),
      google: Boolean(ext.google),
      // `email` in `external` covers password sign-in for this endpoint.
      email: Boolean(ext.email ?? data.external_email_enabled ?? true),
    };
    cached = { at: Date.now(), value };
    return value;
  } catch {
    // Unreachable settings endpoint should not take the login page down.
    return fallback;
  }
}
