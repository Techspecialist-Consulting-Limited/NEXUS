import { NextResponse } from "next/server";
import { z } from "zod";
import { asActor } from "@/lib/db";
import { currentActorId } from "@/lib/session";

/*
 * One-tap answers from the employee's follow-up questions.
 *
 * `declared: true` is the whole point. It records that the person consciously
 * told us this changed, which the scoring in migration 0004 treats very
 * differently from the same status arriving in silence. Writing it through
 * asActor() means RLS decides whether this person may touch this row — a
 * commitment id from someone else's week simply updates nothing.
 */
const body = z.object({
  status: z.enum([
    "promised",
    "in_progress",
    "delivered",
    "partial",
    "deferred",
    "blocked",
    "dropped",
  ]),
  declared: z.boolean().default(true),
  reason: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = body.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const actor = await currentActorId();
  const { status, declared, reason } = parsed.data;

  const updated = await asActor(
    actor,
    (sql) => sql<{ id: string }>`
      update commitments
         set status = ${status}::commitment_status,
             deviation_declared = ${declared},
             declared_at = case when ${declared} then now() else declared_at end,
             outcome_reason = coalesce(${reason ?? null}, outcome_reason),
             delivered_at = case
               when ${status} = 'delivered' then now()
               else delivered_at
             end
       where id = ${id} and deleted_at is null
       returning id
    `,
  );

  if (!updated.length) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
