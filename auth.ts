import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import PostgresAdapter from "@auth/pg-adapter";
import { Pool } from "pg";
import { verifyPassword } from "@/lib/password";

/*
 * Identity, self-hosted. Supabase Auth is gone — this is Auth.js (NextAuth v5)
 * against the same Postgres everything else in this app already talks to.
 *
 * ONE POOL, TWO JOBS. `@auth/pg-adapter` uses it to read and write `users`,
 * `accounts` and `verification_token` — the durable record of who exists and
 * which Microsoft account belongs to them. The Credentials provider below
 * uses the same pool directly to look a person up by email and check their
 * password, since that is not something an adapter does for you.
 *
 * This connection is deliberately separate from `lib/db.ts`'s pool. It never
 * runs as the `authenticated` role and never sets `request.jwt.claim.sub` —
 * identity is resolved BEFORE there is a profile to act as, the same reason
 * `asService()` bypasses RLS for background jobs. See migration 0024.
 *
 * SSL, MATCHED TO WHAT `lib/db.ts` ALREADY ACCEPTS FOR THIS SAME DATABASE.
 * `pg` verifies the server certificate's chain by default the moment any TLS
 * config is present, which a managed Postgres like Aiven's or Neon's fails —
 * they terminate TLS with their own CA, which is not one Node trusts out of
 * the box. The `postgres` driver `lib/db.ts` uses treats `sslmode=require` in
 * the connection string as "encrypt the wire, don't verify who signed the
 * cert" (classic libpq semantics), which is the same connection string
 * working today. `rejectUnauthorized: false` here asks `pg` for that same
 * level of trust rather than a stricter one nothing else in this app applies
 * to this database. Left undefined for a bare local Postgres URL with no
 * `sslmode` at all, which has no TLS listener to negotiate with.
 */
const rawUrl = process.env.DATABASE_URL;
const wantsSsl = rawUrl?.includes("sslmode=require") ?? false;
/*
 * `sslmode` stripped from the string itself, not just overridden. `pg`
 * parses that query parameter on its own terms before merging in the
 * explicit `ssl` option below, and its own reading of `require` is stricter
 * than what is wanted here — leaving it in the string fought with the
 * override instead of being replaced by it.
 */
const connectionString = rawUrl?.replace(/([?&])sslmode=[^&]*&?/i, "$1").replace(/[?&]$/, "");
export const pool = new Pool({
  connectionString,
  ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool),

  /*
   * JWT, NOT DATABASE SESSIONS — Auth.js requires this the moment a
   * Credentials provider is in the list at all (see the provider's own
   * doc comment: credentials sign-ins are never persisted, so a database
   * session has nothing to look up). The trade made here: logging out
   * clears the cookie, but there is no `sessions` row to delete to force an
   * earlier sign-in invalid before its own expiry. Microsoft sign-ins still
   * get a durable `users`/`accounts` row via the adapter — only the SESSION
   * itself is a signed cookie instead of a database row.
   */
  session: { strategy: "jwt" },

  providers: [
    /*
     * Scoped to this organisation's own tenant rather than
     * "https://login.microsoftonline.com/common/v2.0/" (the default when
     * `issuer` is omitted), which would let anyone with ANY Microsoft
     * account — personal or another company's — reach the sign-in screen.
     */
    MicrosoftEntraID({
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      issuer: process.env.AZURE_TENANT_ID
        ? `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`
        : undefined,
    }),

    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : null;
        const password = typeof credentials?.password === "string" ? credentials.password : null;
        if (!email || !password) return null;

        const { rows } = await pool.query<{
          id: string;
          name: string | null;
          email: string;
          password_hash: string | null;
        }>(`select id, name, email, password_hash from users where lower(email) = $1`, [email]);

        const row = rows[0];
        if (!row) return null;

        // Constant-time even for an unknown email would need a dummy hash to
        // compare against; not done here because the row lookup above already
        // answers "does this email exist" through ordinary timing, and this
        // app does not treat account enumeration as a threat it defends
        // against elsewhere either (see lib/onboarding.ts's invitation preview).
        const ok = await verifyPassword(password, row.password_hash);
        if (!ok) return null;

        return { id: row.id, name: row.name, email: row.email };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, account }) {
      if (user) token.sub = user.id;
      if (account) token.provider = account.provider;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.sub === "string") {
        (session.user as { id?: string }).id = token.sub;
      }
      if (session.user && typeof token.provider === "string") {
        (session.user as { provider?: string }).provider = token.provider;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },
});
