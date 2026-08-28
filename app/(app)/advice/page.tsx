import { redirect } from "next/navigation";
import { currentActorId } from "@/lib/session";
import { getPerson, latestVisibleCycle } from "@/lib/queries";
import { executiveBrief } from "@/lib/insights";
import { weeklyBrief } from "@/lib/coach";
import { AdviceFeed } from "@/components/advice/advice-feed";
import { InsightBoard } from "@/components/executive/insight-board";
import { CoachBoard } from "@/components/staff/coach-board";
import { reportingCompliance } from "@/lib/team";

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
    /*
     * Says what is missing, why it matters and what changes it. "Nothing to
     * advise on yet" managed only the first, centred on an otherwise blank
     * page — which is the first thing a Chairman invited during setup saw
     * when he opened Insights.
     */
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-sm font-medium text-white/90">
          No reporting week has settled yet
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-secondary">
          {me.role === "executive"
            ? "Findings are read from what people report, after a week closes and its reconciliations confirm. Nothing is missing — it is simply early."
            : "Your coaching is written after a week settles. The first one arrives once you have reported and the week has closed."}
        </p>
      </div>
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
    const [org, compliance] = await Promise.all([
      executiveBrief(actor, week.id),
      // What separates a clean week from one nobody has filed for.
      reportingCompliance(actor, week.id),
    ]);
    return (
      <InsightBoard
        cycleLabel={week.label}
        insights={org.insights}
        reporting={{
          expected: compliance.length,
          submitted: compliance.filter((r) => r.submitted).length,
        }}
      />
    );
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
