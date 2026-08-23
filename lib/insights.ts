import {
  blockingEdges,
  chronicCarryovers,
  departmentHealth,
  needsSupport,
  type AttentionRow,
  type BlockingEdge,
  type CarryChain,
  type DepartmentHealth,
} from "./queries";

/*
 * The insight layer.
 *
 * Implements the AIInsight contract from GUIDE "Data And AI Contract" —
 * type, confidence, severity, evidence, recommendedAction — and obeys the rule
 * printed directly beneath it: "Do not let AI invent numbers. Counts,
 * percentages, and scores come from data."
 *
 * So every figure in every insight below is read from a SQL result, and the
 * language model is not in this file at all. What a model would add here is
 * phrasing, not findings; the findings are queries. That ordering is what
 * makes the Chairman able to click any claim and land on the rows behind it.
 *
 * GUIDE's own worked example is the bar:
 *
 *   weak   "Creative Hub has 3 blockers."
 *   good   "Creative Hub is blocking 3 delivery commitments in Techspecialist.
 *           The repeated blocker is asset approval, now in its third week.
 *           Suggested action: ask both leads to confirm a single approval
 *           owner before Friday."
 *
 * Reason, impact, next action — every card carries all three.
 */

export type InsightEvidence = {
  label: string;
  source: "commitment" | "check_in" | "department" | "cycle";
  quote?: string;
  href?: string;
};

export type AIInsight = {
  id: string;
  type: "mismatch" | "blocker" | "silence" | "risk" | "coaching" | "dependency";
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  severity: "critical" | "warning" | "normal";
  evidence: InsightEvidence[];
  recommendedAction: string;
};

function plural(n: number, one: string, many = `${one}s`) {
  return n === 1 ? one : many;
}

/** Cross-department bottlenecks — the problem only the Chairman can clear. */
/*
 * How long a dependency has been live, in whole weeks, or null.
 *
 * `oldest_since` is the earliest still-blocked commitment on the edge. Below one
 * full week there is nothing worth saying, so the caller gets null and the
 * sentence simply omits the clause.
 *
 * Floored, never rounded up. A dependency in its ninth day is in its first
 * week, and inflating that is the small dishonesty that costs a system its
 * credibility on the finding people are most likely to check.
 */
function weeksOpen(since: string | null | undefined): number | null {
  if (!since) return null;
  const ms = Date.now() - new Date(since).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const weeks = Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
  return weeks >= 1 ? weeks : null;
}

function fromBlocking(edges: BlockingEdge[]): AIInsight[] {
  return edges.slice(0, 3).map((e, i) => {
    const weeks = weeksOpen(e.oldest_since);

    /*
     * Age raises severity, because it is a different finding.
     *
     * A dependency in its first week is coordination. In its third it is a
     * queue nobody owns. Counting blocked commitments alone treated the two
     * identically.
     */
    const severity =
      e.blocked_count >= 3 || (weeks !== null && weeks >= 3)
        ? ("critical" as const)
        : ("warning" as const);

    const age =
      weeks === null
        ? ""
        : weeks === 1
          ? " The dependency has been open for a week."
          : ` The same dependency has been open for ${weeks} weeks.`;

    return {
      id: `dep-${i}`,
      type: "dependency" as const,
      title: `${e.to_name} is holding up ${e.from_name}`,
      summary:
        `${e.blocked_count} ${plural(e.blocked_count, "commitment")} in ${e.from_name} ` +
        `cannot move until ${e.to_name} clears them.${age} The people waiting are ` +
        `not scored down for it, so this will not show up as anyone's poor week — ` +
        `it only shows up here.`,
      confidence: "high" as const,
      severity,
      evidence: [
        {
          label: `${e.blocked_count} blocked in ${e.from_name}`,
          source: "department" as const,
        },
        { label: `Blocking unit: ${e.to_name}`, source: "department" as const },
        /*
         * Age offered as evidence, not only as prose, so a reader who doubts
         * the claim can see the row it came from.
         */
        ...(weeks === null
          ? []
          : [
              {
                label: `Open ${weeks} ${plural(weeks, "week")}`,
                source: "cycle" as const,
                quote:
                  `The earliest still-blocked commitment dates from ` +
                  `${new Date(e.oldest_since).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}.`,
              },
            ]),
      ],
      recommendedAction:
        weeks !== null && weeks >= 2
          ? `It has not cleared on its own. Ask the ${e.from_name} and ${e.to_name} ` +
            `leads to name one owner for the handoff and commit to a date before Friday.`
          : `Ask the ${e.from_name} and ${e.to_name} leads to name one owner for the ` +
            `handoff and commit to a date before Friday.`,
    };
  });
}


/** Promises that have been renewed week after week. */
function fromCarryovers(chains: CarryChain[]): AIInsight[] {
  return chains.slice(0, 3).map((c) => ({
    id: `carry-${c.commitment_id}`,
    type: "risk" as const,
    title: `“${c.title}” has moved ${c.depth} weeks running`,
    summary:
      `${c.full_name}${c.department_name ? ` in ${c.department_name}` : ""} has ` +
      `carried this commitment ${c.depth} times. Each week on its own looked ` +
      `like a small slip; the chain is the finding. Work that keeps moving is ` +
      `usually too large to finish in a week rather than neglected.`,
    confidence: "high" as const,
    severity: c.depth >= 5 ? ("critical" as const) : ("warning" as const),
    evidence: [
      { label: `Carried ×${c.depth}`, source: "commitment" as const },
      { label: `Currently ${c.status}`, source: "commitment" as const },
    ],
    recommendedAction:
      `Ask ${c.full_name.split(" ")[0]} what the smallest shippable piece of ` +
      `this would be, and let the rest become a separate commitment.`,
  }));
}

/**
 * People who went quiet.
 *
 * GUIDE AI rule 5 and rule 9: silence appears in a manager summary only after
 * the person has had a chance to respond, and nothing negative is escalated
 * before they can clarify. So this is deliberately framed as "needs a
 * conversation", never as a failure, and it is ordered by whether we were told
 * rather than by output.
 */
/*
 * Silence and silent drops.
 *
 * GROUPED, not one finding per person. Three people who each dropped one
 * commitment is ONE fact about the week — "three commitments went quiet" —
 * and emitting it three times produced three cards with identical bodies and
 * identical recommended actions on every surface that renders findings. A
 * reader scanning that learns to skip the whole shape, which is the opposite
 * of what an alert is for.
 *
 * The names still appear, in the summary and as evidence, because "who" is
 * exactly what the Chairman needs before he can ask anybody anything. What is
 * removed is the repetition, not the specificity.
 *
 * Silence and silent drops stay separate findings: not filing at all and
 * filing while omitting something need different conversations, and merging
 * them would blur the distinction the whole integrity score rests on.
 */
function fromAttention(rows: AttentionRow[]): AIInsight[] {
  const insights: AIInsight[] = [];

  const droppers = rows.filter((r) => r.silent_drop_count > 0);
  const missing = rows.filter((r) => !r.responded && r.silent_drop_count === 0);

  if (droppers.length > 0) {
    const total = droppers.reduce((s, r) => s + r.silent_drop_count, 0);
    const names = droppers.map((r) => r.full_name);

    insights.push({
      id: "sig-silent-drops",
      type: "mismatch",
      title:
        droppers.length === 1
          ? `${names[0]} dropped ${total} ${plural(total, "commitment")} without saying so`
          : `${total} ${plural(total, "commitment")} went quiet across ${droppers.length} people`,
      summary:
        `${total} ${plural(total, "commitment")} ended the week unresolved and ` +
        `unmentioned — ${readable(names)}. That is different from being late: ` +
        `being late is visible, and this was not.`,
      confidence: "high",
      severity: "warning",
      evidence: droppers.slice(0, 6).map((r) => ({
        label: `${r.full_name} · ${r.department_name ?? "No unit"}`,
        source: "department" as const,
        quote:
          r.delivery_rate === null
            ? "No delivery recorded this week."
            : `Delivery ${Math.round(r.delivery_rate)}% · ${r.silent_drop_count} ` +
              `${plural(r.silent_drop_count, "commitment")} unaccounted for.`,
      })),
      recommendedAction:
        `Ask what happened to those items before treating the number as real. ` +
        `They have already been asked directly.`,
    });
  }

  if (missing.length > 0) {
    const names = missing.map((r) => r.full_name);
    insights.push({
      id: "sig-no-checkin",
      type: "silence",
      title:
        missing.length === 1
          ? `${names[0]} did not check in`
          : `${missing.length} people did not check in`,
      summary:
        `No update was filed for this week by ${readable(names)}, so there is ` +
        `nothing to compare against what was promised. Treat this as a missing ` +
        `signal, not a missing person.`,
      confidence: "medium",
      severity: "normal",
      evidence: missing.slice(0, 6).map((r) => ({
        label: `${r.full_name} · ${r.department_name ?? "No unit"}`,
        source: "department" as const,
      })),
      recommendedAction:
        `A reminder has gone out. If the next one also passes, ask their lead ` +
        `whether something else is going on.`,
    });
  }

  return insights;
}

/** "Ada, Musa and Segun" — an English list, not a comma-joined array. */
function readable(names: string[]): string {
  if (names.length === 0) return "nobody";
  if (names.length === 1) return names[0];
  if (names.length <= 4) {
    return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  }
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} others`;
}

/** Units carrying an unusual amount of unplanned work. */
function fromFirefighting(depts: DepartmentHealth[]): AIInsight[] {
  return depts
    .filter((d) => d.unplanned_count >= 3 && (d.focus_ratio ?? 100) < 80)
    .slice(0, 2)
    .map((d) => ({
      id: `focus-${d.department_id}`,
      type: "risk" as const,
      title: `${d.department_name} spent the week off-plan`,
      summary:
        `${d.unplanned_count} pieces of work landed in ${d.department_name} that ` +
        `were never committed to. Firefighting is real work and the team is not ` +
        `penalised for it, but a unit running this far off plan is not being ` +
        `interrupted occasionally — it is being interrupted structurally.`,
      confidence: "medium" as const,
      severity: "warning" as const,
      evidence: [
        { label: `${d.unplanned_count} unplanned items`, source: "department" as const },
        {
          label:
            d.focus_ratio === null
              ? "Focus not computed"
              : `Focus ${Math.round(d.focus_ratio)}%`,
          source: "department" as const,
        },
      ],
      recommendedAction:
        `Ask where the interruptions come from. If they come from one place, ` +
        `that is a queue problem rather than a ${d.department_name} problem.`,
    }));
}

export type ExecutiveBrief = {
  /** The one sentence that sits above everything else. */
  headline: string;
  insights: AIInsight[];
  departments: DepartmentHealth[];
  attention: AttentionRow[];
};

export async function executiveBrief(
  actor: string,
  cycleId: string,
): Promise<ExecutiveBrief> {
  const [departments, edges, chains, attention] = await Promise.all([
    departmentHealth(actor, cycleId),
    blockingEdges(actor, cycleId),
    chronicCarryovers(actor),
    needsSupport(actor, cycleId),
  ]);

  const insights = [
    ...fromBlocking(edges),
    ...fromCarryovers(chains),
    ...fromAttention(attention),
    ...fromFirefighting(departments),
  ].sort((a, b) => {
    const rank = { critical: 0, warning: 1, normal: 2 };
    return rank[a.severity] - rank[b.severity];
  });

  /*
   * The headline is assembled from counted facts, in priority order: a
   * cross-team bottleneck outranks a slipping commitment, which outranks
   * silence. If nothing is wrong it says so plainly rather than manufacturing
   * a concern to look useful.
   */
  const withDelivery = departments.filter((d) => d.delivery_rate !== null);
  const orgDelivery = withDelivery.length
    ? Math.round(
        withDelivery.reduce((s, d) => s + (d.delivery_rate ?? 0), 0) /
          withDelivery.length,
      )
    : null;

  const silentTotal = departments.reduce((s, d) => s + d.silent_drop_count, 0);
  const blockedTotal = edges.reduce((s, e) => s + e.blocked_count, 0);
  const notReported = attention.filter((a) => !a.responded).length;

  const clauses: string[] = [];
  if (orgDelivery !== null) {
    clauses.push(`The organisation delivered ${orgDelivery}% of what it promised`);
  }
  if (blockedTotal > 0 && edges[0]) {
    clauses.push(
      `${blockedTotal} ${plural(blockedTotal, "commitment")} ${plural(blockedTotal, "is", "are")} held up by ${edges[0].to_name}`,
    );
  }
  if (silentTotal > 0) {
    clauses.push(
      `${silentTotal} ${plural(silentTotal, "item")} went quiet rather than being flagged`,
    );
  }
  if (notReported > 0) {
    clauses.push(`${notReported} ${plural(notReported, "person", "people")} did not report`);
  }

  const headline =
    clauses.length === 0
      ? "Every unit reported and nothing is blocked across teams this week."
      : `${clauses.join(", ")}.`;

  return { headline, insights, departments, attention };
}
