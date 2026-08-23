import { redirect } from "next/navigation";
import { currentActorId } from "@/lib/session";
import { getPerson, latestVisibleCycle } from "@/lib/queries";
import { executiveBrief } from "@/lib/insights";
import { weeklyBrief } from "@/lib/coach";
import { AdviceFeed } from "@/components/advice/advice-feed";
import { InsightBoard } from "@/components/executive/insight-board";
import { CoachBoard } from "@/components/staff/coach-board";

export const dynamic = "force-dynamic";

/*
 * GUIDE §12 Advice Feed / "AI Insight Center".
 *
 * Same surface, different altitude by role: the Chairman gets organisation-
 * level findings, everyone else gets coaching about their own week. The guide
 * is explicit that these must never be the same page for both.
 */
export default async function AdvicePage() {
  const actor = await currentActorId();
  const me = await getPerson(actor);
  if (!me) redirect("/");

  const week = await latestVisibleCycle(actor);
  if (!week) {
    return (
      <p className="py-16 text-center text-sm text-secondary">
        Nothing to advise on yet.
      </p>
    );
  }

  /*
   * The Chairman's insights are organisation findings and nothing else.
   *
   * He files no check-in, so personal coaching would be a permanently empty
   * half of the page — and computing weeklyBrief for him is a query that can
   * only ever return nothing.
   */
  if (me.role === "executive") {
    const org = await executiveBrief(actor, week.id);
    return <InsightBoard cycleLabel={week.label} insights={org.insights} />;
  }

  /*
   * Personal coaching for everyone who files. A lead's unit findings live on
   * /my-team and HR's monitoring lives on /dashboard, so this page is only
   * ever about the person reading it — which is what keeps it readable as
   * help rather than as a file being kept on them.
   */
  if (me.role === "staff" || me.role === "lead" || me.role === "hr") {
    const personal = await weeklyBrief(actor, me.id, week.id, me.full_name, week.label);
    return (
      <CoachBoard
        cycleLabel={week.label}
        narrative={personal.narrative}
        coaching={personal.coaching}
        questions={personal.questions}
      />
    );
  }

  /* Leads and admins only by this point — both see org findings and their own. */
  const [org, personal] = await Promise.all([
    executiveBrief(actor, week.id),
    weeklyBrief(actor, me.id, week.id, me.full_name, week.label),
  ]);

  return (
    <AdviceFeed
      role={me.role}
      cycleLabel={week.label}
      insights={org.insights}
      coaching={personal.coaching}
      narrative={personal.narrative}
    />
  );
}
