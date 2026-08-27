import { NextResponse } from "next/server";
import { z } from "zod";
import { asActor } from "@/lib/db";
import { currentActorId } from "@/lib/session";
import { getPerson } from "@/lib/queries";
import { submitCheckIn } from "@/lib/checkin";

const body = z.object({
  cycleId: z.string().uuid(),
  progress: z.string().max(4000).default(""),
  plan: z.string().max(4000).default(""),
  /** Whether any of it was spoken rather than typed. */
  dictated: z.boolean().default(false),
  resolutions: z
    .array(
      z.object({
        commitmentId: z.string().uuid(),
        status: z.enum([
          "delivered",
          "partial",
          "in_progress",
          "blocked",
          "deferred",
          "dropped",
        ]),
        reason: z.string().max(500).optional(),
      }),
    )
    .max(50)
    .default([]),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const actor = await currentActorId();
  const me = await getPerson(actor);
  if (!me) return NextResponse.json({ error: "no actor" }, { status: 401 });

  const { cycleId, progress, plan, resolutions, dictated } = parsed.data;

  // The cycle this reports on, and the one new promises land in.
  const cycles = await asActor(
    actor,
    (sql) => sql<{ id: string; label: string; next_id: string | null }>`
      select c.id, c.label,
             (select n.id from cycles n
               where n.org_id = c.org_id and n.kind = 'week' and n.starts_on > c.starts_on
               order by n.starts_on limit 1) as next_id
      from cycles c where c.id = ${cycleId}
    `,
  );
  const cycle = cycles[0];
  if (!cycle) return NextResponse.json({ error: "unknown cycle" }, { status: 404 });

  const outcome = await submitCheckIn(
    actor,
    me.id,
    cycle.id,
    cycle.next_id ?? cycle.id,
    me.full_name,
    cycle.label,
    { progress, plan, resolutions, dictated },
  );

  /*
   * Saving and understanding are reported separately.
   *
   * A 200 used to mean both, so a response the model mangled looked identical
   * to a clean one and the person was told "Filed" over an empty screen. The
   * report is saved in every branch that reaches here — what varies is whether
   * anything was understood, and the client says so rather than implying more
   * than happened.
   */
  return NextResponse.json({
    ok: true,
    saved: true,
    processed: !outcome.processingFailed,
    /** Saved and readable, but nothing was extracted from it yet. */
    processingFailed: outcome.processingFailed ?? null,
    /*
     * True only when the submission recorded NOTHING AT ALL.
     *
     * Tap resolutions count. Somebody who marks three commitments delivered
     * and writes no prose has told the system a great deal, and answering
     * that with "nothing was recognised" would be both wrong and insulting.
     */
    understoodNothing:
      !outcome.processingFailed &&
      outcome.extraction.commitments.length === 0 &&
      outcome.extraction.updates.length === 0 &&
      resolutions.length === 0,
    checkInId: outcome.checkInId,
    extracted: outcome.extraction.commitments.map((c) => ({
      title: c.title,
      quote: c.source_quote,
      priority: c.priority,
    })),
    updates: outcome.extraction.updates.map((u) => ({
      title: u.commitment_title,
      status: u.status,
      declared: u.declared,
    })),
    blockers: outcome.extraction.blockers,
    unmentioned: outcome.unmentioned,
  });
}
