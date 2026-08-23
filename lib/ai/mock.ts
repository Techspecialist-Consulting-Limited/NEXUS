import type {
  AiProvider,
  AiResult,
  ExtractionResult,
  NarrativeResult,
  Adjudication,
  DigestContext,
  DigestResult,
  ToneContext,
  ToneResult,
  AssistantContext,
  AssistantAnswer,
  CheckInDraft,
  WeeklyHistory,
} from "./types";

/*
 * A deterministic stand-in for the model.
 *
 * This is not a stub that returns lorem ipsum. It genuinely parses a check-in
 * with rules — verbs and tense for status, lexical overlap for matching — so
 * every screen, every query and every test can be built and run before the
 * Azure deployment exists, and so CI never depends on a paid API.
 *
 * It is also the control. When the real provider produces something strange,
 * the first useful question is "what does the mock do with this input?", and
 * a rules-based answer to that is worth having.
 */

const DONE = /\b(shipped|finished|completed|delivered|closed|launched|done|merged|published)\b/i;
const PARTIAL = /\b(partly|partially|halfway|most of|nearly|almost|in progress|still working|underway)\b/i;
const BLOCKED =
  /\b(blocked|blocking|blocks|waiting on|held up|holding up|stuck|can'?t proceed|depends on|pending sign-?off)\b/i;
const DEFERRED = /\b(pushed|deferred|moved to|slipping|slipped|next week instead|rescheduled)\b/i;
const DROPPED = /\b(dropped|abandoned|cancelled|canceled|not doing|shelved|parked)\b/i;
const FUTURE = /\b(will|going to|plan to|planning|next week|aim to|intend to|i'?ll)\b/i;

const DEPARTMENT_HINTS = [
  "Creative Hub",
  "Media Hub",
  "Techspecialist",
  "Operations",
  "Growth",
];

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

/** Jaccard overlap on content words — the same cheap signal the reconciler uses. */
export function overlap(a: string, b: string): number {
  const stop = new Set([
    "the", "a", "an", "and", "or", "to", "of", "for", "on", "in", "with",
    "this", "that", "is", "was", "be", "we", "i", "it", "our", "my", "up",
  ]);
  const norm = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stop.has(w)),
    );
  const A = norm(a);
  const B = norm(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / new Set([...A, ...B]).size;
}

function titleFrom(sentence: string): string {
  return sentence
    .replace(/^(shipped|finished|completed|delivered|closed|launched|published|still|also|and)\b[:,]?\s*/i, "")
    .replace(/^(i|we)\s+(will|am|are|have|plan to|going to|intend to)\s*/i, "")
    .replace(/[.!?]+$/, "")
    .trim()
    .slice(0, 200);
}

export class MockProvider implements AiProvider {
  readonly name = "mock";
  readonly model = "rules-v1";

  private timed<T>(data: T, started: number): AiResult<T> {
    return {
      data,
      usage: {
        provider: this.name,
        model: this.model,
        promptTokens: 0,
        completionTokens: 0,
        costUsd: 0,
        latencyMs: Date.now() - started,
      },
    };
  }

  async answer(input: AssistantContext): Promise<AiResult<AssistantAnswer>> {
    const started = Date.now();
    const f = input.facts as {
      delivery_rate?: number | null;
      signal_integrity?: number | null;
      people_responded?: number | null;
      people_reporting?: number | null;
      units?: { name: string; delivery: number | null; reported: string }[];
      findings?: { title: string; summary: string; recommendedAction: string; severity: string }[];
      blockers?: { from: string; to: string; count: number }[];
    };

    const q = input.question.toLowerCase();
    const figures: AssistantAnswer["figures"] = [];
    const push = (label: string, value: string | number | null | undefined) => {
      if (value !== null && value !== undefined) figures.push({ label, value: String(value) });
    };

    /*
     * Rules, not a language model — the same control the rest of the mock
     * provides. It answers a handful of real question shapes from the same
     * fact pack the model receives, so the whole surface can be built, tested
     * and demonstrated without a deployment, and so there is always a
     * deterministic answer to compare a strange live one against.
     */
    const worst = (f.units ?? [])
      .filter((u) => u.delivery !== null)
      .sort((a, b) => (a.delivery ?? 0) - (b.delivery ?? 0))[0];
    const finding = (f.findings ?? [])[0];

    /*
     * One answer, short and plain — the same contract the live prompt is held
     * to. Forty to seventy words, one idea per sentence, no jargon. If the
     * offline path is allowed to be wordier than production, the layout gets
     * designed against the wrong shape of answer.
     */
    let detail: string;
    let answered = true;

    if (/blocked|blocker|blocking|stuck|waiting|depend/.test(q)) {
      const b = (f.blockers ?? [])[0];
      if (b) {
        detail = `${b.to} is waiting on ${b.from}. ${b.count} ${b.count === 1 ? "commitment cannot" : "commitments cannot"} move until that clears. Blocked work is left out of the delivery score, so this is not counted against ${b.to}. Ask both leads to name one owner for the handoff, with a date.`;
        push("Commitments held", b.count);
      } else {
        detail = "Nothing is blocked between teams this week. No commitment is waiting on another unit.";
      }
    } else if (/who|support|struggl|behind|worst/.test(q) && worst) {
      detail = `${worst.name} is furthest behind, at ${worst.delivery}% delivery. ${worst.reported} of its people reported.${finding ? ` ${finding.summary}` : ""}${finding ? ` ${finding.recommendedAction}` : ""}`;
      push(`${worst.name} delivery`, `${worst.delivery}%`);
      push("Group delivery", f.delivery_rate === null || f.delivery_rate === undefined ? undefined : `${f.delivery_rate}%`);
    } else if (/how|doing|track|overall|going|summary|status/.test(q)) {
      detail = `Delivery is ${f.delivery_rate ?? "unknown"}% and told-in-time is ${f.signal_integrity ?? "unknown"}%. ${f.people_responded ?? 0} of ${f.people_reporting ?? 0} people reported for ${input.cycleLabel}.${finding ? ` ${finding.summary} ${finding.recommendedAction}` : ""}`;
      push("Delivery", f.delivery_rate === null || f.delivery_rate === undefined ? undefined : `${f.delivery_rate}%`);
      push("Told in time", f.signal_integrity === null || f.signal_integrity === undefined ? undefined : `${f.signal_integrity}%`);
      push("Reported", `${f.people_responded ?? 0}/${f.people_reporting ?? 0}`);
    } else {
      /*
       * The important branch. Not knowing must be a real, reachable answer —
       * a stand-in that always produces something confident would let the UI
       * be built against a case that never happens in production.
       */
      answered = false;
      detail = `I do not have that. What I do have for ${input.cycleLabel} is delivery and told-in-time rates, how each unit is doing, what is blocked between teams, and who may need support.`;
    }

    return this.timed(
      {
        detail,
        figures,
        followUps: answered
          ? ["What is blocked between teams?", "Who needs support this week?"]
          : ["How are we doing this week?"],
        answered,
      },
      started,
    );
  }

  async draft(input: {
    text: string;
    personName: string;
    cycleLabel: string;
    openCommitments: { id: string; title: string }[];
  }): Promise<AiResult<CheckInDraft>> {
    const started = Date.now();

    /*
     * Rules, so the whole inline check-in can be built, tested and demonstrated
     * with no deployment — and so there is always a deterministic answer to
     * compare a strange live one against.
     */
    const past: string[] = [];
    const future: string[] = [];
    const updates: CheckInDraft["updates"] = [];
    const seen = new Set<string>();

    for (const sentence of sentences(input.text)) {
      if (FUTURE.test(sentence)) future.push(sentence);
      else past.push(sentence);

      // Which open commitment, if any, is this sentence about?
      let best: { title: string; score: number } | null = null;
      for (const open of input.openCommitments) {
        const score = overlap(sentence, open.title);
        if (score > (best?.score ?? 0)) best = { title: open.title, score };
      }
      if (!best || best.score < 0.28 || seen.has(best.title)) continue;

      /*
       * Blocked is tested before done: "finished the design but it is blocked
       * on legal" is a blocker that happens to mention finishing.
       */
      const status = BLOCKED.test(sentence)
        ? "blocked"
        : DROPPED.test(sentence)
          ? "dropped"
          : DEFERRED.test(sentence)
            ? "deferred"
            : DONE.test(sentence)
              ? "delivered"
              : PARTIAL.test(sentence)
                ? "partial"
                : FUTURE.test(sentence)
                  ? "in_progress"
                  : null;

      if (!status) continue;
      seen.add(best.title);
      // They said it out loud, which IS the declaration.
      updates.push({ title: best.title, status, declared: true });
    }

    const blockedWithoutOwner = updates.some(
      (u) => u.status === "blocked" && !/\b(waiting on|blocked by)\s+\w/i.test(input.text),
    );

    return this.timed(
      {
        progress: past.join(" ").trim(),
        plan: future.join(" ").trim(),
        updates,
        question: blockedWithoutOwner ? "Who is that blocked on?" : null,
      },
      started,
    );
  }

  async extract(input: {
    text: string;
    openCommitments: { id: string; title: string }[];
    personName: string;
    cycleLabel: string;
  }): Promise<AiResult<ExtractionResult>> {
    const started = Date.now();
    const result: ExtractionResult = {
      commitments: [],
      updates: [],
      blockers: [],
      mentions: [],
    };

    for (const sentence of sentences(input.text)) {
      // Does this sentence talk about something already promised?
      let best: { id: string; title: string; score: number } | null = null;
      for (const open of input.openCommitments) {
        const score = overlap(sentence, open.title);
        if (score > (best?.score ?? 0)) best = { ...open, score };
      }

      const matched = best && best.score >= 0.28;

      if (matched) {
        const status = DROPPED.test(sentence)
          ? "dropped"
          : BLOCKED.test(sentence)
            ? "blocked"
            : DEFERRED.test(sentence)
              ? "deferred"
              : DONE.test(sentence)
                ? "delivered"
                : PARTIAL.test(sentence)
                  ? "partial"
                  : "in_progress";

        result.updates.push({
          commitment_title: best!.title,
          status,
          // Saying it out loud IS the declaration — which is precisely why a
          // commitment that appears in no sentence produces no update here.
          declared: status !== "delivered",
          reason: status === "delivered" ? undefined : sentence.slice(0, 500),
          blocked_by_department: DEPARTMENT_HINTS.find((d) =>
            sentence.toLowerCase().includes(d.toLowerCase()),
          ),
          source_quote: sentence.slice(0, 500),
          confidence: Math.min(0.95, 0.5 + best!.score),
        });
        continue;
      }

      if (FUTURE.test(sentence) && !DONE.test(sentence)) {
        const title = titleFrom(sentence);
        if (title.length >= 3) {
          result.commitments.push({
            title,
            priority: /\b(urgent|critical|must|blocker)\b/i.test(sentence)
              ? "critical"
              : "normal",
            source_quote: sentence.slice(0, 500),
            targets: "next_cycle",
            confidence: 0.7,
          });
        }
        continue;
      }

      if (BLOCKED.test(sentence)) result.blockers.push(sentence.slice(0, 300));
    }

    return this.timed(result, started);
  }

  async adjudicate(input: {
    report: string;
    candidates: { commitment_id: string; title: string }[];
  }): Promise<AiResult<{ rulings: Adjudication[] }>> {
    const started = Date.now();
    const rulings: Adjudication[] = input.candidates.map((c) => {
      const score = overlap(input.report, c.title);
      const verdict =
        score < 0.2
          ? "unclear"
          : DONE.test(input.report)
            ? "satisfied"
            : PARTIAL.test(input.report)
              ? "partial"
              : "not_satisfied";
      return {
        commitment_id: c.commitment_id,
        verdict,
        evidence_quote: input.report.slice(0, 400),
        confidence: Math.min(0.9, 0.4 + score),
      };
    });
    return this.timed({ rulings }, started);
  }

  async narrate(input: {
    personName: string;
    cycleLabel: string;
    metrics: Record<string, unknown>;
    unmentioned: string[];
    history?: WeeklyHistory;
  }): Promise<AiResult<NarrativeResult>> {
    const started = Date.now();
    const m = input.metrics as Record<string, number | boolean | null>;

    const parts: string[] = [];
    if (Number(m.protected_count) > 0) {
      parts.push(
        `${m.protected_count} of your commitments ${Number(m.protected_count) === 1 ? "was" : "were"} held by another team. That is not counted against your delivery, and the dependency has been raised.`,
      );
    }
    /*
     * One comparison, and only when the data is there.
     *
     * `history` is absent for a first week. The rule the prompt states is the
     * rule the mock keeps: no history means say nothing about the past — not
     * "this is your first week", and never an invented direction.
     */
    const prev = input.history?.previous;
    const now = Number(m.delivery_rate);
    const movement =
      prev && prev.delivery_rate !== null && Number.isFinite(now)
        ? now > prev.delivery_rate + 5
          ? `, up from ${prev.delivery_rate}% the week before`
          : now < prev.delivery_rate - 5
            ? `, down from ${prev.delivery_rate}% the week before`
            : `, about where you were the week before`
        : "";

    parts.push(
      `You delivered ${m.delivered_count} of ${m.promised_count} commitments this week${movement}.`,
    );

    const carried = input.history?.carried?.[0];
    if (carried) {
      parts.push(
        `"${carried.title}" has now moved ${carried.times} times — each week on its own looked small, but the chain is the part worth acting on.`,
      );
    }
    if (Number(m.unplanned_count) > 0) {
      parts.push(
        `${m.unplanned_count} ${Number(m.unplanned_count) === 1 ? "piece" : "pieces"} of work landed that ${Number(m.unplanned_count) === 1 ? "was" : "were"} never planned — worth naming next time so the week reflects it.`,
      );
    }
    if (Number(m.silent_drop_count) === 0 && Number(m.deferred_count) > 0) {
      parts.push(`You flagged what was slipping while there was still time to react.`);
    }

    return this.timed(
      {
        narrative: parts.join(" "),
        coaching: Number(m.carryover_count) > 0
          ? [
              {
                title: "Something has been carried more than once",
                body: `${m.carryover_count} ${Number(m.carryover_count) === 1 ? "commitment" : "commitments"} arrived from a previous week. If one keeps moving, it is usually too big to finish in a week — worth splitting it.`,
                based_on: "carryover_count",
              },
            ]
          : [],
        questions: input.unmentioned.map(
          (t) => `You committed to "${t}" but did not mention it. Done, dropped, or still going?`,
        ),
      },
      started,
    );
  }


  /*
   * Tone, without a model.
   *
   * These templates are not filler — they are the wording the product falls
   * back to whenever no provider is configured, which is every offline run and
   * every test. They follow the same rules the prompt states: name the thing,
   * ask for one step, never imply fault. A real model varies the phrasing; it
   * does not change what is being asked.
   */
  async tone(input: ToneContext): Promise<AiResult<ToneResult>> {
    const started = Date.now();
    const f = input.facts as Record<string, string | number | undefined>;
    const first = input.recipientName.split(" ")[0];

    let title: string;
    let body: string;
    let ask: string | undefined;

    switch (input.kind) {
      case "commitment_mismatch":
        title = `Is "${f.title}" still on track?`;
        body =
          `You committed to this ${f.age ?? "last week"} and it has not been ` +
          `resolved since. Nobody else sees this yet.`;
        ask = "Mark it complete, delayed, or blocked.";
        break;

      case "checkin_reminder":
        title = "Your standup is open";
        body =
          `It takes about thirty seconds, ${first}. Last week's commitments are ` +
          `already filled in — you only say what changed.`;
        ask = "Check in.";
        break;

      case "blocker_owner":
        title = `${f.blockedUnit} is waiting on ${f.owningUnit}`;
        body =
          `${f.count} ${Number(f.count) === 1 ? "commitment" : "commitments"} cannot ` +
          `move until your unit clears them. The people waiting are not scored ` +
          `down for it, so it will not show up as anyone's poor week.`;
        ask = "Name one owner and a decision date.";
        break;

      case "silent_drop":
        // Sensitive: a question, never a verdict.
        title = `About "${f.title}"`;
        body =
          `This ended the week unresolved and unmentioned. That is different ` +
          `from being late, and it may be nothing — you tell us first.`;
        ask = "Was it done, dropped, or is it still going?";
        break;

      case "exec_digest":
        title = "This week across the organisation";
        body = String(f.headline ?? "The weekly brief is ready.");
        ask = "Read the brief.";
        break;

      default:
        title = String(f.title ?? "NEXUS");
        body = String(f.body ?? "There is something waiting for you.");
        ask = undefined;
    }

    return this.timed({ title, body, ask }, started);
  }


  /*
   * The executive briefing, without a model.
   *
   * Assembled from the same computed figures the real provider is handed, so
   * an offline demo shows the real structure — headline, what moved, decisions
   * paired with actions — rather than a placeholder. The wording is flatter
   * than gpt-5 manages; the shape and the facts are identical.
   */
  async digest(input: DigestContext): Promise<AiResult<DigestResult>> {
    const started = Date.now();
    const m = input.metrics as Record<string, number | null>;

    const delivery = m.delivery_rate;
    const previous = (input.previous ?? {}) as Record<string, number | null>;
    const movement =
      delivery !== null && typeof previous.delivery_rate === "number"
        ? Math.round(delivery - previous.delivery_rate)
        : null;

    const whatChanged: string[] = [];
    if (movement !== null && movement !== 0) {
      whatChanged.push(
        `Delivery moved ${movement > 0 ? "up" : "down"} ${Math.abs(movement)} points against last period.`,
      );
    }
    if (Number(m.silent_drop_count) > 0) {
      whatChanged.push(
        `${m.silent_drop_count} commitments ended the period unresolved and unmentioned.`,
      );
    }
    if (Number(m.protected_count) > 0) {
      whatChanged.push(
        `${m.protected_count} commitments were held by another team and excluded from delivery.`,
      );
    }

    const decisions = input.findings
      .filter((f) => f.severity !== "normal")
      .slice(0, 3)
      .map((f) => ({
        risk: f.summary,
        action: f.recommendedAction,
        concerns: f.title,
      }));

    // Recognition is a leadership action too, and declaring a slip early is
    // the behaviour this product most wants to reinforce.
    const praise: string[] = [];
    if (Number(m.silent_drop_count) === 0 && Number(m.deferred_count) > 0) {
      praise.push(
        "Every change of plan this period was flagged in advance rather than discovered afterwards.",
      );
    }

    const headline =
      delivery === null
        ? `${input.orgName} has no settled figures for ${input.cycleLabel} yet.`
        : `${input.orgName} delivered ${delivery}% of what it promised in ${input.cycleLabel}` +
          (decisions.length
            ? `, with ${decisions.length} ${decisions.length === 1 ? "matter" : "matters"} needing a decision.`
            : ", with nothing escalated.");

    return this.timed(
      {
        subject:
          decisions.length > 0
            ? `${input.cycleLabel}: ${decisions.length} ${decisions.length === 1 ? "decision" : "decisions"} for you`
            : `${input.cycleLabel}: nothing blocked`,
        headline,
        whatChanged,
        decisions,
        praise,
      },
      started,
    );
  }

  async embed(texts: string[]): Promise<AiResult<number[][]>> {
    const started = Date.now();
    // A stable hashed bag-of-words. Not semantic, but deterministic and enough
    // for the cheap-path matcher to be exercised end to end offline.
    const vectors = texts.map((t) => {
      const v = new Array(1536).fill(0);
      for (const word of t.toLowerCase().split(/\W+/).filter(Boolean)) {
        let h = 0;
        for (let i = 0; i < word.length; i++) h = (h * 31 + word.charCodeAt(i)) | 0;
        v[Math.abs(h) % 1536] += 1;
      }
      const len = Math.hypot(...v) || 1;
      return v.map((x) => x / len);
    });
    return this.timed(vectors, started);
  }
}
