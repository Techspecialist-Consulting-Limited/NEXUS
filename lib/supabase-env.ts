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
  /*
   * Whether the three flags above were READ from the project, or are the
   * conservative default used when the settings endpoint could not be asked.
   *
   * WHY THIS EXISTS
   *
   * The fallback is "no social providers", which is indistinguishable from a
   * project that genuinely has Microsoft and Google switched off. So a
   * deployment whose publishable key was wrong — answering 401 here — told
   * people the exact opposite of the truth: the login screen said Microsoft
   * was "not switched on for this project yet" and sent them to the Supabase
   * dashboard to enable a provider that was already enabled, while the admin
   * Integrations screen reported it as "Not enabled on this project".
   *
   * Both were stating a fact about the Supabase dashboard that neither had
   * checked. "I could not find out" has to be sayable, so it is a value here
   * rather than an absence.
   */
  known: boolean;
};

let cached: { at: number; value: EnabledProviders } | null = null;

export async function enabledProviders(): Promise<EnabledProviders> {
  // Social off, email on — but flagged as a guess, never as an observation.
  const unknown: EnabledProviders = {
    azure: false,
    google: false,
    email: true,
    known: false,
  };
  if (!hasSupabase) return unknown;

  if (cached && Date.now() - cached.at < 60_000) return cached.value;

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_KEY },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) {
      /*
       * Said out loud on purpose. This failed silently through an entire
       * deployment: a wrong publishable key answers 401, the sign-in screen
       * quietly dropped to email only, and nothing anywhere named the cause.
       * The status code is the whole diagnosis — 401 is the key, anything 5xx
       * is Supabase — so it belongs in the log rather than in a shrug.
       */
      console.warn(
        `[nexus] Could not read Supabase auth settings: ${res.status} ${res.statusText}. ` +
          "Sign-in will offer email only. If this is 401, check " +
          "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY on this deployment.",
      );
      return unknown;
    }

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
      known: true,
    };
    cached = { at: Date.now(), value };
    return value;
  } catch (error) {
    // Unreachable settings endpoint should not take the login page down.
    console.warn(
      "[nexus] Could not reach Supabase auth settings: " +
        `${error instanceof Error ? error.message : String(error)}. ` +
        "Sign-in will offer email only.",
    );
    return unknown;
  }
}
