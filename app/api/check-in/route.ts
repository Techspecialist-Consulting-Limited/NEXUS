import { after, NextResponse } from "next/server";
import { z } from "zod";
import { asActor } from "@/lib/db";
import { currentActorId } from "@/lib/session";
import { getPerson } from "@/lib/queries";
import { interpretCheckIn, recordCheckIn } from "@/lib/checkin";

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

/*
 * The model runs in `after`, past the response, and that time still counts
 * against the route. Vercel's default would cut it off mid-extraction.
 */
export const maxDuration = 120;

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const actor = await currentActorId();
  const { cycleId, progress, plan, resolutions, dictated } = parsed.data;

  /*
   * EVERYTHING THE PERSON WAITS FOR, IN ONE ROUND-TRIP.
   *
   * currentActorId() already returns membership.profileId, and getPerson()
   * selects the row with that id — so `me.id` and `actor` are the same string
   * and the save never needed to wait for the lookup. The cycle's label and
   * its successor are only read by the interpretation, which now runs after
   * the response. So none of these three block each other, and they no longer
   * pretend to.
   *
   * Sequentially this was four trips to a remote Postgres before the words
   * were safe. It is two: prove who you are, then write.
   */
  const [recorded, me, cycles] = await Promise.all([
    recordCheckIn(actor, actor, cycleId, { progress, plan, resolutions, dictated }),
    getPerson(actor),
    asActor(
      actor,
      (sql) => sql<{ id: string; label: string; next_id: string | null }>`
        select c.id, c.label,
               (select n.id from cycles n
                 where n.org_id = c.org_id and n.kind = 'week' and n.starts_on > c.starts_on
                 order by n.starts_on limit 1) as next_id
        from cycles c where c.id = ${cycleId}
      `,
    ),
  ]);

  const cycle = cycles[0];

  const worthReading = recorded.rawText.trim().length > 0 && Boolean(me) && Boolean(cycle);
  if (worthReading && me && cycle) {
    after(async () => {
      try {
        await interpretCheckIn(
          actor,
          me.id,
          cycle.id,
          cycle.next_id ?? cycle.id,
          me.full_name,
          cycle.label,
          recorded,
          { progress, plan, resolutions, dictated },
        );
      } catch (error) {
        /*
         * Already handled inside interpretCheckIn for model failures; this
         * catches anything past it so a background rejection cannot take the
         * process down.
         */
        const detail = error instanceof Error ? error.message : String(error);
        console.error(
          `[nexus] check-in ${recorded.checkInId} recorded but interpretation threw: ${detail}`,
        );
      }
    });
  }

  /*
   * Saving and understanding are reported separately.
   *
   * A 200 here means SAVED — which is the promise this product actually makes
   * about somebody's own words. `interpreting` says the second half is still
   * running, so the client can tell the truth about why the week's commitments
   * are not on screen yet instead of implying they were not understood.
   */
  return NextResponse.json({
    ok: true,
    saved: true,
    interpreting: worthReading,
    checkInId: recorded.checkInId,
  });
}
