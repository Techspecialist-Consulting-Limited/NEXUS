import { NextResponse } from "next/server";
import { setActor } from "@/lib/session";
import { asService } from "@/lib/db";
import { DEV_SIGNED_OUT, DEV_STRANGER } from "@/lib/auth";

/** Demo-only seat switching. Real auth replaces this without touching callers. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const profileId = body?.profileId;

  // Dev only: step out of every seat so the sign-in screens are reachable.
  if (body?.signOut === true) {
    await setActor(DEV_SIGNED_OUT);
    return NextResponse.json({ ok: true });
  }

  // Dev only: signed in, but belonging to nothing — the onboarding state.
  if (body?.stranger === true) {
    await setActor(DEV_STRANGER);
    return NextResponse.json({ ok: true });
  }

  if (typeof profileId !== "string" || !profileId) {
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  }

  const rows = await asService(
    (sql) => sql<{ id: string }>`select id from profiles where id = ${profileId}`,
  );
  if (!rows.length) {
    return NextResponse.json({ error: "unknown profile" }, { status: 404 });
  }

  await setActor(profileId);
  return NextResponse.json({ ok: true });
}
