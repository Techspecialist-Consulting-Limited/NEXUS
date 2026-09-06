import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/auth";
import { hashPassword } from "@/lib/password";

/*
 * Create the account itself. Signing in is a separate step the browser takes
 * right after — this route only ever produces a `users` row, the same split
 * Supabase's signUp/session pair had. It does not touch `profiles`: joining or
 * founding an organisation is /api/onboarding's job, unchanged by any of this,
 * because it already worked in terms of an `Identity` rather than Supabase
 * specifically.
 *
 * No email confirmation step. The Supabase project this replaces had it
 * switched off (see the old sign-in-panel.tsx: signUp returned a session
 * immediately), so this matches existing behaviour rather than adding a step
 * that was never there.
 */
const body = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  fullName: z.string().max(120).optional(),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That request was not valid." }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const { password, fullName } = parsed.data;

  const existing = await pool.query(`select 1 from users where lower(email) = $1`, [email]);
  if (existing.rowCount) {
    return NextResponse.json(
      { error: "There is already an account with that email. Sign in instead." },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);
  await pool.query(
    `insert into users (name, email, password_hash) values ($1, $2, $3)`,
    [fullName?.trim() || null, email, passwordHash],
  );

  return NextResponse.json({ ok: true });
}
