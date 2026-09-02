import { NextResponse } from "next/server";
import { z } from "zod";
import { currentViewer } from "@/lib/auth";
import {
  currentCycle,
  getPerson,
  openCheckInCycle,
  recentCycles,
} from "@/lib/queries";
import { openCommitments } from "@/lib/checkin";
import { aiProvider } from "@/lib/ai/provider";

/*
 * Sort what somebody said into a check-in they can confirm. Save nothing.
 *
 * This route is deliberately incapable of writing. The person reads the draft,
 * edits it, and only then does the submit hit /api/check-in — so the worst
 * outcome of any bug here, or of instruction-shaped text arriving in dictated
 * speech, is a wrong suggestion on a screen they were about to correct anyway.
 *
 * That separation is the whole safety property of the inline flow, and it is
 * worth protecting deliberately: if this route ever writes, the confirmation
 * step stops being a safeguard and becomes decoration.
 */

const body = z.object({
  text: z.string().min(1).max(4000),
  cycleId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { text } = parsed.data;

  if (text.trim().split(/\s+/).filter(Boolean).length < 3) {
    return NextResponse.json({ error: "too short to sort" }, { status: 422 });
  }

  const viewer = await currentViewer();
  if (!viewer || viewer.membership.status !== "active") {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const actor = viewer.membership.profileId;
  const me = await getPerson(actor);
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  /*
   * The week being reported on is the CURRENT one, not the last settled one.
   * A check-in is filed against the week in progress; using the settled week
   * would file this week's words against a week already closed.
   *
   * THE COMMENT ABOVE WAS RIGHT AND THE CODE UNDER IT DID THE OPPOSITE.
   * `recentCycles` excludes the current week by design, so this resolved to
   * the last CLOSED one — exactly what the paragraph rules out — and returned
   * nothing at all on an organisation whose first week has not ended.
   *
   * Same ordering as /check-in and /my-week, so a draft cannot be sorted
   * against a different week from the one the page is filing.
   */
  const [cycles, current, openWeek] = await Promise.all([
    recentCycles(actor),
    currentCycle(actor),
    openCheckInCycle(actor, me.id),
  ]);
  const week = current ?? openWeek ?? cycles.at(-1);
  if (!week) {
    return NextResponse.json({ error: "no open week" }, { status: 409 });
  }

  const open = await openCommitments(actor, me.id, week.id);

  try {
    const { data } = await aiProvider().draft({
      text,
      personName: me.full_name,
      cycleLabel: week.label,
      openCommitments: open.map((c) => ({ id: c.id, title: c.title })),
    });

    /*
     * Resolve titles back to ids HERE, not in the browser.
     *
     * The model returns titles, and a title it invented resolves to nothing —
     * which is exactly what should happen. Matching server-side against the
     * commitments this person actually holds means a hallucinated title can
     * never become a status change on a real row, whatever the client does
     * with the response.
     */
    const byTitle = new Map(open.map((c) => [c.title.toLowerCase(), c]));
    const resolved = data.updates
      .map((u) => {
        const match = byTitle.get(u.title.toLowerCase());
        return match
          ? { commitmentId: match.id, title: match.title, status: u.status, declared: u.declared }
          : null;
      })
      .filter((u): u is NonNullable<typeof u> => u !== null);

    return NextResponse.json({
      draft: { progress: data.progress, plan: data.plan, question: data.question },
      updates: resolved,
      cycleId: week.id,
      cycleLabel: week.label,
    });
  } catch (error) {
    /*
     * A failed sort must never cost somebody their words. They are still in
     * the box on the client, and the card falls back to submitting them as
     * written — which is a complete, valid check-in on its own.
     */
    console.error("[nexus:check-in] draft failed", error);
    return NextResponse.json({ error: "could not sort that" }, { status: 502 });
  }
}
