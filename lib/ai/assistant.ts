import { asActor } from "../db";
import { aiProvider } from "./provider";
import { executiveBrief } from "../insights";
import {
  commitmentsFor,
  getPerson,
  latestVisibleCycle,
  reconciliationFor,
  teamWeek,
} from "../queries";
import type { AssistantAnswer } from "./types";

/*
 * The assistant.
 *
 * Somebody speaks a question and gets a real answer — "why is Creative Hub
 * behind?", "what is blocked?", "who needs help this week?" — rather than a
 * transcription of their own voice.
 *
 * TWO THINGS DECIDE WHETHER THIS IS TRUSTWORTHY
 *
 * 1. NUMBERS COME FROM SQL. The fact pack below is counted by the same queries
 *    that draw the dashboard, so an answer and the screen behind it can never
 *    disagree. The model explains the facts; it is never asked what a delivery
 *    rate was. A figure a model produced is a figure an executive eventually
 *    checks, and that happens exactly once before nothing is trusted again.
 *
 * 2. THE PACK IS BUILT THROUGH RLS. Everything here reads as the asker, so the
 *    assistant cannot become the one door in the building that opens wider
 *    than the person standing at it. A lead asking about another department
 *    gets what a lead may see, because the query returns what a lead may see —
 *    not because a prompt asked the model to be discreet.
 *
 * The second point is why the pack is assembled per role rather than
 * assembled once and filtered. Filtering after the fact means the data existed
 * in the process, one bug away from a prompt.
 */

export type AssistantTurn = { question: string; answer: string };

export type AssistantReply = {
  answer: AssistantAnswer;
  cycleLabel: string;
  meta: { model: string; provider: string; latencyMs: number };
};

/**
 * Everything this person may know about this week, counted.
 *
 * Deliberately narrow. The assistant answers about the reporting week, not
 * about the company in general — a fact pack that tried to cover everything
 * would be mostly irrelevant to any given question and would cost latency on
 * every one of them.
 */
async function factsFor(
  actor: string,
  role: string,
  cycleId: string,
): Promise<Record<string, unknown>> {
  // `actor` is both the reader and, for staff, the subject: an employee asks
  // about their own week and nobody else's.
  if (role === "executive" || role === "admin" || role === "hr") {
    const brief = await executiveBrief(actor, cycleId);

    const withValue = brief.departments.filter((d) => d.delivery_rate !== null);
    const mean = (pick: (d: (typeof brief.departments)[number]) => number | null) => {
      const rows = brief.departments.filter((d) => pick(d) !== null);
      return rows.length
        ? Math.round(rows.reduce((s, d) => s + (pick(d) ?? 0), 0) / rows.length)
        : null;
    };

    return {
      delivery_rate: mean((d) => d.delivery_rate),
      signal_integrity: mean((d) => d.signal_integrity),
      people_reporting: brief.departments.reduce((s, d) => s + d.people_reporting, 0),
      people_responded: brief.departments.reduce((s, d) => s + d.people_responded, 0),
      silent_drop_count: brief.departments.reduce((s, d) => s + d.silent_drop_count, 0),
      unplanned_count: brief.departments.reduce((s, d) => s + d.unplanned_count, 0),
      protected_count: brief.departments.reduce((s, d) => s + d.protected_count, 0),
      units_reporting: withValue.length,
      units: brief.departments.map((d) => ({
        name: d.department_name,
        delivery: d.delivery_rate === null ? null : Math.round(d.delivery_rate),
        told_in_time: d.signal_integrity === null ? null : Math.round(d.signal_integrity),
        reported: `${d.people_responded}/${d.people_reporting}`,
        silent_drops: d.silent_drop_count,
        blocked_and_protected: d.protected_count,
      })),
      findings: brief.insights.slice(0, 5).map((i) => ({
        title: i.title,
        summary: i.summary,
        severity: i.severity,
        recommendedAction: i.recommendedAction,
      })),
      // headline is deliberately omitted: it is assembled from the same
      // findings above, and repeating it costs prompt tokens on every
      // question to tell the model something it already has.
    };
  }

  if (role === "lead") {
    /*
     * A lead's altitude is their own unit. GUIDE "Manager UX: Support, Not
     * Policing" — the default frame is where can I help, so the pack leads
     * with who is blocked rather than who is behind.
     */
    const me = await getPerson(actor);
    const week = me?.department_id ? await teamWeek(actor, me.department_id, cycleId) : null;

    return {
      unit: me?.department_name ?? null,
      team: week,
    };
  }

  // Staff: their own week, and nothing about anybody else.
  const [mine, recon] = await Promise.all([
    commitmentsFor(actor, actor, cycleId),
    reconciliationFor(actor, actor, cycleId),
  ]);

  return {
    my_commitments: mine,
    my_week: recon,
  };
}

/*
 * A short-lived cache of the fact pack.
 *
 * The facts for a SETTLED week do not change between questions — that is what
 * settled means. Recomputing them per question spent 2.5 seconds of network
 * on every follow-up to produce a byte-identical result, which in a spoken
 * conversation is the difference between a dialogue and a series of forms.
 *
 * THE KEY INCLUDES THE ACTOR, and that is not an optimisation detail.
 * Everything in the pack was filtered by RLS as a specific person, so a cache
 * keyed on the cycle alone would serve a lead the Chairman's org-wide view
 * because they happened to ask second. Keyed per actor, the worst case is a
 * wasted entry.
 *
 * Sixty seconds, because the honest bound is "how long may somebody see a
 * stale answer", not "how long can we get away with". A week's figures change
 * when a reconciliation is confirmed; a minute of staleness cannot outlive a
 * conversation.
 */
const FACT_TTL_MS = 60_000;
const factCache = new Map<string, { at: number; facts: Record<string, unknown> }>();

async function cachedFacts(
  actor: string,
  role: string,
  cycleId: string,
): Promise<Record<string, unknown>> {
  const key = `${actor}:${cycleId}`;
  const hit = factCache.get(key);
  if (hit && Date.now() - hit.at < FACT_TTL_MS) return hit.facts;

  const facts = await factsFor(actor, role, cycleId);
  factCache.set(key, { at: Date.now(), facts });

  /*
   * Bounded, so a long-running server cannot accumulate one entry per person
   * per week forever. Evicting the oldest is enough — this is a latency
   * cache, not a store, and a miss costs a query rather than correctness.
   */
  if (factCache.size > 200) {
    const oldest = [...factCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) factCache.delete(oldest[0]);
  }

  return facts;
}

/**
 * Ask a question out loud and get an answer back.
 *
 * Returns the answer only. Nothing is written, no status changes, no
 * notification is sent — asking about the organisation must never alter it,
 * or people will stop asking.
 */
export async function ask(input: {
  actor: string;
  question: string;
  history: AssistantTurn[];
}): Promise<AssistantReply | null> {
  /*
   * Two round trips, not four.
   *
   * Measured: getPerson 0.3s, latestVisibleCycle 1.3s, the fact pack 2.5s,
   * the org name 0.3s — run one after another that is four seconds of
   * network before the model is even asked, on top of its own three. Nothing
   * in the first pair depends on the other, so they go together; the fact
   * pack needs the cycle, so it waits, and the org name rides alongside it.
   *
   * Latency is the feature in a spoken interface. An answer that arrives
   * after somebody has given up and clicked into a page has failed, however
   * good it was.
   */
  const [me, week] = await Promise.all([
    getPerson(input.actor),
    latestVisibleCycle(input.actor),
  ]);

  if (!me) return null;

  /*
   * The latest week this person may SEE, which is normally one behind the
   * calendar because the current week is still inside the correction window.
   * Answering from unconfirmed reconciliations would brief somebody on
   * numbers their subject has not seen — the one promise this product makes
   * to the people it reports on.
   */
  if (!week) return null;

  const [facts, orgName] = await Promise.all([
    cachedFacts(input.actor, me.role, week.id),
    asActor(
      input.actor,
      (sql) => sql<{ name: string }>`
        select o.name from organizations o
        join profiles p on p.org_id = o.id
        where p.id = ${input.actor}
      `,
    ).then((rows) => rows[0]?.name ?? "your organisation"),
  ]);

  const { data, usage } = await aiProvider().answer({
    askerName: me.full_name,
    askerRole: me.role,
    orgName,
    cycleLabel: week.label,
    question: input.question,
    facts,
    history: input.history,
  });

  return {
    answer: data,
    cycleLabel: week.label,
    meta: {
      model: usage.model,
      provider: usage.provider,
      latencyMs: usage.latencyMs ?? 0,
    },
  };
}
