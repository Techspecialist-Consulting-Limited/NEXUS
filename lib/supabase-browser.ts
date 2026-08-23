"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL } from "./supabase-env";

/*
 * The browser-side Supabase client, used only to START an authentication
 * flow: signInWithOAuth for Microsoft Entra ID and Google, or password sign-in.
 *
 * It never decides anything. The redirect lands on /auth/callback, the server
 * exchanges the code, and every question about who this person is and what
 * they may do is answered server-side against the database. A client that
 * could grant itself a role would make the whole membership model decorative.
 */
export function supabaseBrowser() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
}

/**
 * Entra ID is `azure` in Supabase Auth.
 *
 * The scopes matter: without `email` the provider may return a session with no
 * address, and an invitation is matched on email — so the acceptance would
 * fail with a confusing "issued to a different address".
 */
export const OAUTH_PROVIDERS = {
  azure: { label: "Microsoft", scopes: "email openid profile" },
  google: { label: "Google", scopes: "email profile" },
} as const;

export type OAuthProvider = keyof typeof OAUTH_PROVIDERS;
