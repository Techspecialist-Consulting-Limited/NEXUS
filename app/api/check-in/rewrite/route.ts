import { NextResponse } from "next/server";
import { z } from "zod";
import { currentViewer } from "@/lib/auth";
import { getPerson } from "@/lib/queries";
import { aiProvider } from "@/lib/ai/provider";

/*
 * Tidy what somebody wrote. Save nothing.
 *
 * The same shape as ../draft/route.ts, and for the same reason: this route is
 * deliberately incapable of writing. It returns a suggestion, the person reads
 * it beside their own words and chooses, and only their choice ever reaches
 * /api/check-in. If this route could write, "Accept rewrite" would stop being
 * a decision and become a label on something that had already happened.
 *
 * WHY THE ACCEPTED TEXT IS SAFE TO FILE AS AUTHORSHIP.
 *
 * `check_ins.raw_text` is guarded by guard_raw_text() in migration 0002 and
 * documented as "exactly what the human wrote" — and the whole product leans on
 * that: `source_quote` is shown to the Chairman as this person's own sentence,
 * in quotation marks, under their name.
 *
 * That holds here because the rewrite happens BEFORE any check-in row exists.
 * Nothing is overwritten; a person edits their own draft with help, exactly as
 * they would with a spell-checker, and files what they chose. The prompt is
 * held to a narrow contract for the same reason — see REWRITE_SYSTEM: change
 * the typing, never the facts and never the strength of what was said.
 */

const body = z.object({
  text: z.string().min(1).max(4000),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { text } = parsed.data;

  /*
   * Three words is the same floor the draft route uses. Below it there is
   * nothing to tidy, and a "rewrite" of two words is a model call spent on
   * changing somebody's mind about their own sentence.
   */
  if (text.trim().split(/\s+/).filter(Boolean).length < 3) {
    return NextResponse.json({ error: "too short to rewrite" }, { status: 422 });
  }

  const viewer = await currentViewer();
  if (!viewer || viewer.membership.status !== "active") {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const actor = viewer.membership.profileId;
  const me = await getPerson(actor);
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  try {
    const { data } = await aiProvider().rewrite({
      text,
      personName: me.full_name,
    });

    /*
     * A rewrite identical to the input is reported as such rather than offered.
     * "Accept" and "Keep mine" leading to the same text is a choice that cannot
     * be made wrong and should not be asked.
     */
    const tidied = data.text.trim();
    return NextResponse.json({
      text: tidied,
      unchanged: data.unchanged || tidied === text.trim(),
    });
  } catch {
    /*
     * A failed rewrite is not a failed check-in. The person still has exactly
     * what they typed and can file it unchanged, which was always a valid
     * update — so this reports that the help was unavailable, not that
     * anything was lost.
     */
    return NextResponse.json(
      { error: "NEXUS could not rewrite that just now. Your words are unchanged." },
      { status: 503 },
    );
  }
}
