/**
 * Prove a seeded demo account can actually sign in against real Supabase.
 *
 * Writing a bcrypt hash straight into auth.users bypasses GoTrue entirely, so
 * "the row exists" is not evidence that the login works. This asks GoTrue.
 *
 * Usage: node --env-file-if-exists=.env.local scripts/verify-remote-login.ts <email> <password>
 */
import { SUPABASE_URL, SUPABASE_KEY } from "../lib/supabase-env.ts";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("usage: verify-remote-login.ts <email> <password>");
  process.exit(1);
}

const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});

const body = await res.json();

if (res.ok && body.access_token) {
  console.log(`PASS — ${email} signed in.`);
  console.log(`  user id: ${body.user?.id}`);
  console.log(`  confirmed: ${Boolean(body.user?.email_confirmed_at)}`);
  process.exit(0);
}

console.error(`FAIL — ${res.status}: ${body.error_description ?? body.msg ?? JSON.stringify(body)}`);
process.exit(1);
