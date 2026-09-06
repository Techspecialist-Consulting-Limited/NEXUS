/*
 * Which real sign-in methods are actually configured, read from this
 * process's own environment rather than asked of an external service.
 *
 * The old version of this file (lib/supabase-env.ts) had to ask Supabase's
 * `/auth/v1/settings` endpoint at request time, because whether Microsoft was
 * switched on was a fact that lived in Supabase's dashboard, not here — and
 * that round trip could itself fail, which is why it tracked a third "known"
 * state. Now the same three environment variables that configure the
 * Microsoft Entra ID provider (see auth.ts) are the only source of truth for
 * whether the button should even appear, so this is a synchronous, local
 * check with nothing left to fail.
 */
export function microsoftConfigured(): boolean {
  return Boolean(
    process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_CLIENT_SECRET &&
      process.env.AZURE_TENANT_ID,
  );
}
