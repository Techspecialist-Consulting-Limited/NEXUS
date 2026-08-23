import { NextResponse } from "next/server";
import { currentViewer } from "@/lib/auth";
import { asActor } from "@/lib/db";

/*
 * "I have seen the introduction."
 *
 * A POST with no body: there is exactly one thing it can say, and the only
 * question is who is saying it. The write goes through asActor against
 * `profiles_update_self`, so it can only ever mark the person making the
 * request.
 *
 * Deliberately not idempotency-guarded beyond `where welcomed_at is null`. A
 * double tap should not move the timestamp — "when did you first see this" is
 * the question the column answers, and overwriting it with the second tap
 * would make it answer "when did you last dismiss it" instead.
 */
export async function POST() {
  const viewer = await currentViewer();
  if (!viewer || viewer.membership.status !== "active") {
    return NextResponse.json({ error: "You are not signed in." }, { status: 401 });
  }

  await asActor(
    viewer.membership.profileId,
    (sql) => sql`
      update profiles
         set welcomed_at = now(), updated_at = now()
       where id = ${viewer.membership.profileId}
         and welcomed_at is null
    `,
  );

  return NextResponse.json({ ok: true });
}

/**
 * Read it again.
 *
 * Clears the timestamp so the introduction shows once more. Not a separate
 * "replay" flag: one column with one meaning — has this person seen it — is
 * easier to reason about than two that can disagree.
 */
export async function DELETE() {
  const viewer = await currentViewer();
  if (!viewer || viewer.membership.status !== "active") {
    return NextResponse.json({ error: "You are not signed in." }, { status: 401 });
  }

  await asActor(
    viewer.membership.profileId,
    (sql) => sql`
      update profiles set welcomed_at = null, updated_at = now()
       where id = ${viewer.membership.profileId}
    `,
  );

  return NextResponse.json({ ok: true });
}
