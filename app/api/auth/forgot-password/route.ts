import { NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset } from "@/lib/password-reset";
import { emailConfigured, passwordResetEmail, send } from "@/lib/email";

/*
 * Always answers the same way, whether or not the address has an account.
 *
 * A different response for "no such account" is exactly how a reset form
 * becomes a way to check who is signed up here — the same reasoning that
 * keeps the sign-in failure message generic on the credentials side. What
 * changes based on the account existing happens entirely server-side: an
 * email either goes out, or nothing happens at all.
 */
const body = z.object({ email: z.string().email().max(200) });

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That request was not valid." }, { status: 400 });
  }

  const result = await requestPasswordReset(parsed.data.email);

  if (result && emailConfigured()) {
    const origin = new URL(request.url).origin;
    const link = `${origin}/reset-password?email=${encodeURIComponent(
      parsed.data.email.trim().toLowerCase(),
    )}&token=${result.token}`;

    const { subject, html, text } = passwordResetEmail({ name: result.name, link });
    await send({ to: parsed.data.email, subject, html, text });
  }

  return NextResponse.json({ ok: true });
}
