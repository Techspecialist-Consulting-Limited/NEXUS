import { asActor } from "./db";
import { aiProvider } from "./ai/provider";
import { commitmentsFor, personTrend, reconciliationFor } from "./queries";
import type { CommitmentRow, Reconciliation } from "./queries";
import type { WeeklyHistory } from "./ai/types";

/*
 * The employee's weekly readout: the numbers, the prose, and the questions.
 *
 * The split GUIDE §15 rule 1 insists on is visible right here — every figure
 * passed into narrate() was computed by SQL in migration 0004, and the model
 * receives them as finished facts. It writes sentences around them. It is
 * never asked what the delivery rate was.
 */

export type WeeklyBrief = {
  reconciliation: Reconciliation | null;
  commitments: CommitmentRow[];
  narrative: string;
  coaching: { title: string; body: string; based_on: string }[];
  questions: string[];
};

export async function weeklyBrief(
  actor: string,
  profileId: string,
  cycleId: string,
  personName: string,
  cycleLabel: string,
): Promise<WeeklyBrief> {
  const [reconciliation, commitments] = await Promise.all([
    reconciliationFor(actor, profileId, cycleId),
    commitmentsFor(actor, profileId, cycleId),
  ]);

  if (!reconciliation) {
    return { reconciliation: null, commitments, narrative: "", coaching: [], questions: [] };
  }

  /*
   * "Unmentioned" is the heart of the product: a commitment that ended the
   * week dropped or deferred WITHOUT the person saying so. The distinction
   * between a declared change and a silent one is the whole difference
   * between a coach and a surveillance tool, and it is stored as a column
   * rather than guessed at read time.
   */
  const unmentioned = commitments
    .filter(
      (c) =>
        !c.deviation_declared &&
        (c.status === "dropped" || c.status === "deferred"),
    )
    .map((c) => c.title);

  /*
   * Generated ONCE, then stored.
   *
   * This used to call narrate() on every render and then throw the result away
   * in favour of the stored one — paying the model for an answer it did not
   * use. On real data that was 22 to 34 seconds of blocking work on the
   * employee's home page, the screen the PRD calls the highest-priority in the
   * product, every single time it loaded.
   *
   * Migration 0004 already anticipated this: refresh_reconciliation()
   * "deliberately does NOT touch ai_narrative, ai_coaching", precisely so the
   * write survives recomputation. The columns were built for a cache; nothing
   * was filling them.
   */
  const storedCoaching = Array.isArray(reconciliation.ai_coaching)
    ? (reconciliation.ai_coaching as WeeklyBrief["coaching"])
    : [];

  if (reconciliation.ai_narrative) {
    return {
      reconciliation,
      commitments,
      narrative: reconciliation.ai_narrative,
      coaching: storedCoaching,
      /*
       * Questions are recomputed rather than stored: they are about what is
       * still unresolved right now, and a question about a commitment the
       * person has since answered would be worse than no question at all.
       */
      questions: unmentioned.map(
        (title) => `You committed to "${title}" — what happened to it?`,
      ),
    };
  }

  const history = await buildHistory(actor, profileId, cycleId, commitments);

  const { data } = await aiProvider().narrate({
    personName,
    cycleLabel,
    history,
    metrics: {
      promised_count: reconciliation.promised_count,
      delivered_count: reconciliation.delivered_count,
      partial_count: reconciliation.partial_count,
      deferred_count: reconciliation.deferred_count,
      blocked_count: reconciliation.blocked_count,
      dropped_count: reconciliation.dropped_count,
      silent_drop_count: reconciliation.silent_drop_count,
      carryover_count: reconciliation.carryover_count,
      unplanned_count: reconciliation.unplanned_count,
      protected_count: reconciliation.protected_count,
      delivery_rate: reconciliation.delivery_rate,
      signal_integrity: reconciliation.signal_integrity,
    },
    unmentioned,
  });

  /*
   * Written through asActor, so RLS decides whether this person may store a
   * narrative on this row. A cache that wrote as the service role would be a
   * quiet way around the policies for the sake of a faster page.
   */
  await asActor(
    actor,
    (sql) => sql`
      update reconciliations
         set ai_narrative = ${data.narrative},
             ai_coaching  = ${JSON.stringify(data.coaching)}::text::jsonb
       where id = ${reconciliation.id}
    `,
  ).catch((error) => {
    // A cache that cannot be written is slow, not broken. Never fail the page.
    console.warn("[nexus:coach] could not store the narrative", error);
  });

  return {
    reconciliation,
    commitments,
    narrative: data.narrative,
    coaching: data.coaching,
    questions: data.questions,
  };
}/*
 * What came before, compacted.
 *
 * The coach used to receive only this week's counts, so it could describe the
 * week and nothing else — no "again", no "about where you have been", no "third
 * time". A voice with no memory reads as a receipt, and the fix is not a better
 * prompt: you cannot instruct a model to reference a cycle it was never given.
 *
 * Everything here is omitted when absent. A first-ever week produces `{}`, and
 * the prompt treats that as "say nothing about the past" rather than as a gap
 * to fill.
 */
async function buildHistory(
  actor: string,
  profileId: string,
  cycleId: string,
  commitments: CommitmentRow[],
): Promise<WeeklyHistory> {
  const trend = await personTrend(actor, profileId);

  // Everything strictly before the week being written about.
  const at = trend.findIndex((t) => t.cycle_id === cycleId);
  const earlier = at === -1 ? trend : trend.slice(0, at);

  const history: WeeklyHistory = {};

  if (earlier.length > 0) {
    history.settled_weeks = earlier.length;

    const last = earlier[earlier.length - 1];
    /*
     * `promised_count` is what the previous reconciliation counted. Delivered
     * is derived from the rate rather than stored separately, so it is only
     * offered when the rate exists — a null rate means the week never settled,
     * and a fabricated "0 of 5" would be worse than no comparison at all.
     */
    if (last.delivery_rate !== null) {
      history.previous = {
        label: last.label,
        promised: last.promised_count,
        delivered: Math.round((last.delivery_rate / 100) * last.promised_count),
        delivery_rate: Math.round(last.delivery_rate),
      };
    }

    const rates = earlier
      .slice(-4)
      .map((t) => t.delivery_rate)
      .filter((r): r is number => r !== null)
      .map((r) => Math.round(r));
    if (rates.length > 1) history.recent_delivery_rates = rates;
  }

  /*
   * Work that has been renewed rather than finished. `carry_depth` is computed
   * by the query that returns these rows, so this is a read rather than a
   * second trip.
   */
  const carried = commitments
    .filter((c) => c.carry_depth > 1)
    .sort((a, b) => b.carry_depth - a.carry_depth)
    .slice(0, 3)
    .map((c) => ({ title: c.title, times: c.carry_depth }));
  if (carried.length > 0) history.carried = carried;

  const waiting = [
    ...new Set(
      commitments
        .filter((c) => c.status === "blocked" && c.depends_on_department)
        .map((c) => c.depends_on_department as string),
    ),
  ];
  if (waiting.length > 0) history.waiting_on = waiting;

  return history;
}


