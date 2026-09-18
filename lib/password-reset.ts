import { randomBytes } from "node:crypto";
import { pool } from "@/auth";
import { hashPassword } from "./password";

/*
 * Forgot password, for the one provider that needs it — Microsoft accounts
 * have no password here to forget.
 *
 * Reuses `verification_token` (see migration 0024), Auth.js's own table for
 * exactly this shape of thing — an identifier, a single-use token, an
 * expiry — rather than inventing a second one. Tokens are stored raw, the
 * same convention this app already uses for invitation tokens (lib/onboarding.ts)
 * and the one Auth.js's own adapter uses for this very table.
 */

const TOKEN_TTL_MS = 60 * 60 * 1000; // one hour

export async function requestPasswordReset(
  email: string,
): Promise<{ token: string; name: string | null } | null> {
  const normalized = email.trim().toLowerCase();

  const { rows } = await pool.query<{ id: string; name: string | null }>(
    `select id, name from users where lower(email) = $1 and password_hash is not null`,
    [normalized],
  );
  const user = rows[0];
  if (!user) return null;

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TOKEN_TTL_MS);

  /*
   * One live token per address. Without clearing the old one, requesting a
   * second reset email leaves the first link still valid — so whichever one
   * arrives, or is read, later still works, which is not what "here is a
   * fresh link" is supposed to mean.
   */
  await pool.query(`delete from verification_token where identifier = $1`, [normalized]);
  await pool.query(
    `insert into verification_token (identifier, token, expires) values ($1, $2, $3)`,
    [normalized, token, expires],
  );

  return { token, name: user.name };
}

/** Returns whether the reset actually happened. A bad or expired token is `false`, not an error. */
export async function resetPassword(
  email: string,
  token: string,
  newPassword: string,
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();

  /*
   * Deleted as part of finding it, single-use like the adapter's own
   * `useVerificationToken` — a token that fails the expiry check just below
   * is still gone, so a leaked or intercepted reset link cannot be replayed
   * even once its window has passed.
   */
  const { rows } = await pool.query<{ expires: string }>(
    `delete from verification_token where identifier = $1 and token = $2 returning expires`,
    [normalized, token],
  );
  const row = rows[0];
  if (!row) return false;
  if (new Date(row.expires).getTime() < Date.now()) return false;

  const passwordHash = await hashPassword(newPassword);
  await pool.query(`update users set password_hash = $1 where lower(email) = $2`, [
    passwordHash,
    normalized,
  ]);
  return true;
}
