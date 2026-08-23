import { NextResponse } from "next/server";
import { z } from "zod";
import { currentViewer } from "@/lib/auth";
import { ask } from "@/lib/ai/assistant";

/*
 * Ask the assistant something.
 *
 * Read-only by construction: no writes, no ids to act on, no notifications.
 * Asking about the organisation must never change it — partly because that is
 * the honest contract, and partly because a question arrives as speech, which
 * is untrusted text that reaches a model verbatim. A route that cannot act
 * cannot be talked into acting.
 */

const body = z.object({
  /*
   * Capped at a sentence or two of speech. A question is short; anything
   * longer is either a mis-fired recogniser or somebody using the assistant as
   * a prompt window, and both deserve a refusal rather than a bill.
   */
  question: z.string().min(1).max(1000),
  history: z
    .array(
      z.object({
        question: z.string().max(1000),
        answer: z.string().max(2500),
      }),
    )
    .max(8)
    .default([]),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { question, history } = parsed.data;

  /*
   * Reject nothing, not short things.
   *
   * This used to require two words, which was written for the microphone: a
   * recogniser that mis-fires emits one stray syllable and there is no point
   * paying for an answer to it. Applied to the typed field it was simply
   * wrong. "Blockers?", "Operations", "Techspecialist" are how people type a
   * question into a box, and every one of them came back 422 — which the
   * console rendered as "I could not answer that just now. Try again in a
   * moment.", advice that could never come true.
   *
   * The gate now asks only whether there is anything to answer at all: two
   * characters that are a letter or a digit. "?" and "  " still stop here.
   * A single real word costs one cheap call and gets a real answer, or the
   * assistant's own "I do not have that" — which is the better failure.
   */
  if (question.replace(/[^\p{L}\p{N}]/gu, "").length < 2) {
    return NextResponse.json({ error: "nothing to answer" }, { status: 422 });
  }

  /*
   * currentViewer, not requireViewer: a redirect here would hand a fetch the
   * sign-in page with a 200, and an expired session would read as a
   * successful answer to nothing.
   */
  const viewer = await currentViewer();
  if (!viewer || viewer.membership.status !== "active") {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  try {
    const reply = await ask({
      actor: viewer.membership.profileId,
      question,
      history,
    });

    if (!reply) {
      return NextResponse.json(
        {
          error: "nothing to answer from",
          detail: "No settled reporting week yet.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(reply);
  } catch (error) {
    console.error("[nexus:assistant] failed", error);
    return NextResponse.json({ error: "could not answer" }, { status: 502 });
  }
}
