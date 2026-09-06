import { NextResponse } from "next/server";
import { z } from "zod";
import { resetPassword } from "@/lib/password-reset";

const body = z.object({
  email: z.string().email().max(200),
  token: z.string().min(10).max(200),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That request was not valid." }, { status: 400 });
  }

  const ok = await resetPassword(parsed.data.email, parsed.data.token, parsed.data.password);
  if (!ok) {
    return NextResponse.json(
      { error: "That link has expired or was already used. Request a new one." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
