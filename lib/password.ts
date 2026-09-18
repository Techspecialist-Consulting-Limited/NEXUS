import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const KEY_LENGTH = 64;

/*
 * Password hashing, for the one provider Auth.js does not do this for.
 *
 * scrypt rather than a new dependency: Node has shipped it in `crypto` since
 * 10.5, it is memory-hard by design (the property bcrypt lacks and the reason
 * it is still recommended over a bare hash), and reaching for `bcryptjs` or
 * `argon2` here would mean carrying a package for something the runtime
 * already does.
 *
 * Encoded as `salt:hash`, both hex, so verification never has to guess the
 * salt length back out of a fixed-width blob.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

/**
 * Constant-time compare. A hash from a Microsoft-only account is `null` —
 * that account has no password to check against, so this returns `false`
 * rather than throwing, and the credentials sign-in path treats it exactly
 * like a wrong password.
 */
export async function verifyPassword(
  password: string,
  stored: string | null,
): Promise<boolean> {
  if (!stored) return false;
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;

  const hash = Buffer.from(hashHex, "hex");
  const candidate = (await scrypt(password, salt, hash.length)) as Buffer;

  // Lengths can differ if `stored` is malformed; timingSafeEqual throws on a
  // mismatch rather than returning false, so that case is ruled out first.
  if (candidate.length !== hash.length) return false;
  return timingSafeEqual(candidate, hash);
}
