import { z } from "zod";

/*
 * What the model is allowed to produce.
 *
 * Every schema here is validated before a single row is written. A model that
 * returns something unexpected must fail loudly at the boundary rather than
 * quietly persist a malformed commitment that shows up three weeks later as a
 * wrong number in an executive's email.
 *
 * Note what is absent: there is no field anywhere in this file for a score, a
 * rate, a percentage or a tally. The model extracts structure and writes prose.
 * Arithmetic belongs to SQL (migration 0004), because a figure an executive
 * might check has to be reproducible.
 */

export const commitmentPriority = z.enum(["critical", "high", "normal", "low"]);

export const commitmentStatus = z.enum([
  "promised",
  "in_progress",
  "delivered",
  "partial",
  "deferred",
  "blocked",
  "dropped",
  "superseded",
]);

/*
 * Status words a model reaches for that are not in the enum.
 *
 * Only unambiguous ones. "completed" can mean exactly one thing and dropping it
 * would lose a delivered commitment; "reviewed" could mean half a dozen things
 * and is deliberately absent, because guessing wrong here writes a false fact
 * about somebody's week into the record.
 */
const STATUS_SYNONYM: Record<string, string> = {
  complete: "delivered",
  completed: "delivered",
  done: "delivered",
  finished: "delivered",
  shipped: "delivered",
  closed: "delivered",
  ongoing: "in_progress",
  "in progress": "in_progress",
  started: "in_progress",
  "partially complete": "partial",
  "partially completed": "partial",
  "partially delivered": "partial",
  postponed: "deferred",
  delayed: "deferred",
  rescheduled: "deferred",
  stuck: "blocked",
  waiting: "blocked",
  cancelled: "dropped",
  canceled: "dropped",
  abandoned: "dropped",
};

/**
 * The status the model gave, normalised — or nothing.
 *
 * Nothing is a real answer here and it is the important one. A deployment
 * returns update objects carrying `commitment_title` and `source_quote` and NO
 * `status` at all, on roughly a quarter of reports that have open commitments:
 * the model has noticed the work was mentioned and has declined to say what
 * became of it.
 *
 * That is not a defect to paper over with a default. There is no honest default
 * — `in_progress` invents progress nobody claimed, `delivered` invents a
 * delivery, and `promised` silently erases a mention. NEXUS already has the
 * right answer for this case: the commitment stays unmentioned, the person is
 * shown it as drift, and THEY say what happened. The system asks rather than
 * assumes, which is the whole reason `declared` exists two fields below.
 *
 * So: undefined, which fails `commitmentStatus` and drops the whole update.
 *
 * The inner schema is deliberately NOT `.optional()`. Wrapping it made the key
 * optional on the enclosing object, so an update with no `status` at all was
 * skipped by the validator entirely and sailed through with the field simply
 * missing — the exact response this exists to catch.
 */
const looseStatus = z.preprocess((raw) => {
  if (typeof raw !== "string") return raw;
  const t = raw.trim().toLowerCase().replace(/[-\s]+/g, "_");
  const direct = commitmentStatus.safeParse(t);
  if (direct.success) return direct.data;
  return STATUS_SYNONYM[t] ?? STATUS_SYNONYM[t.replace(/_/g, " ")] ?? raw;
}, commitmentStatus);

/**
 * An array whose bad elements are dropped rather than failing the whole result.
 *
 * THE LESSON, GENERALISED. Migration 0020 and the `blockers` repair both came
 * from one shape of failure: a model answers correctly and packages one field
 * differently, Zod rejects the array, the provider throws, and a person loses
 * their entire week's report to the least important thing in the response.
 *
 * `sentenceList` fixed that for two string fields. This fixes it for every
 * structured list: parse each element on its own, keep what stands up, and say
 * out loud what was discarded. A partial extraction the person can correct is
 * strictly better than no extraction and an error message.
 *
 * `label` is only for the warning. Silent data loss is its own bug.
 */
function salvage<T extends z.ZodTypeAny>(element: T, label: string, max: number) {
  return z.preprocess(
    (raw) => {
      if (!Array.isArray(raw)) return raw;
      const kept: unknown[] = [];
      let dropped = 0;
      let why = "";
      for (const item of raw) {
        const parsed = element.safeParse(item);
        if (parsed.success) kept.push(parsed.data);
        else {
          dropped++;
          /*
           * Keep the first reason. "Dropped 2 commitments" is a log line that
           * tells whoever reads it to go and reproduce the problem; "dropped 2
           * — source_quote: too small" tells them what to change.
           */
          if (!why) {
            const issue = parsed.error.issues[0];
            why = `${issue?.path.join(".") || "(root)"}: ${issue?.message ?? "unknown"}`;
            /*
             * NEXUS_AI_DUMP=1 prints the whole offending item.
             *
             * Off by default because model output can carry somebody's own
             * words, and a debug flag should not be the reason a check-in ends
             * up in a log aggregator. On, it is the difference between knowing
             * a field was missing and knowing the model answered with an
             * entirely different shape — which is how {person, week, text} was
             * found where {title, source_quote} was expected.
             */
            if (process.env.NEXUS_AI_DUMP) {
              console.warn(`[nexus:ai] dropped ${label} item: ${JSON.stringify(item)}`);
            }
          }
        }
      }
      if (dropped > 0) {
        console.warn(
          `[nexus:ai] dropped ${dropped} unusable ${label} from a model response; ` +
            `kept ${kept.length} — ${why}. The report itself is unaffected.`,
        );
      }
      return kept.slice(0, max);
    },
    z.array(element).max(max),
  );
}

/** A promise found in someone's own words. */
export const extractedCommitment = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(1000).optional(),
  category: z.string().max(60).optional(),
  priority: commitmentPriority.default("normal"),
  estimated_effort_hours: z.number().min(0).max(200).optional(),

  /**
   * A VERBATIM slice of what the person wrote. Not a paraphrase, not a
   * cleaned-up version. This is what the interface quotes back when it says
   * "you said this", and it is the difference between a system people trust
   * and a system that puts words in their mouths.
   */
  source_quote: z.string().min(3).max(500),

  /** Which cycle the work is for. Said on Friday, usually next week. */
  targets: z.enum(["this_cycle", "next_cycle"]).default("next_cycle"),

  confidence: z.number().min(0).max(1).default(0.8),
});

/**
 * A report about a commitment that already exists.
 *
 * `status` is required, and an update that arrives without a usable one is
 * dropped by `salvage` rather than defaulted — see `looseStatus`. An update
 * with no status is not a status update.
 */
export const statusUpdate = z.object({
  /** Matches an open commitment by title; the caller resolves it to an id. */
  commitment_title: z.string().min(3).max(200),
  status: looseStatus,

  /**
   * Did the person actually SAY this was changing, or is the model inferring
   * it from silence? Only an explicit statement counts, and the whole
   * integrity score turns on this distinction — so the prompt is emphatic
   * that absence of mention is never a declaration.
   */
  declared: z.boolean().default(false),

  reason: z.string().max(500).optional(),
  blocked_by_department: z.string().max(80).optional(),
  source_quote: z.string().max(500).optional(),
  confidence: z.number().min(0).max(1).default(0.8),
});

/**
 * A list of short strings — however the model chose to wrap them.
 *
 * WHY THIS EXISTS. `blockers` was `z.array(z.string())`. The live deployment
 * returns objects:
 *
 *   "blockers": [{ "description": "Vendor approval is blocked by Legal",
 *                  "source_quote": "Vendor approval is still blocked by Legal." }]
 *
 * Zod rejected the array, the provider threw, and because extraction ran
 * before the insert the ENTIRE submission was discarded — including three
 * perfectly extracted commitments in the same response. Real people lost real
 * reports to the shape of the least important field in the result.
 *
 * `narrativeResult.coaching` already solved this exact class of problem in the
 * other direction and the lesson was left there. It is generalised here: a
 * model that answers the question correctly but packages it differently must
 * not cost somebody their week's work.
 *
 * Strictly a normaliser, not a parser. It reads the obvious text key and drops
 * anything with no text at all, rather than inventing a value.
 */
const TEXT_KEYS = ["description", "text", "title", "blocker", "summary", "detail", "name"];

function sentenceList(maxLen: number, maxItems: number) {
  return z
    .array(
      z.union([
        z.string(),
        z
          .looseObject({})
          .transform((o) => {
            const rec = o as Record<string, unknown>;
            for (const k of TEXT_KEYS) {
              const v = rec[k];
              if (typeof v === "string" && v.trim()) return v;
            }
            return "";
          }),
      ]),
    )
    // Trim to the schema's limit rather than rejecting: an over-long blocker
    // is still a blocker, and refusing it would restore the failure this
    // exists to prevent.
    .transform((list) =>
      list
        .map((v) => v.trim().slice(0, maxLen))
        .filter(Boolean)
        .slice(0, maxItems),
    );
}

/*
 * TWO SHAPES, AND THE ORDER THEY ARE TRIED IN MATTERS.
 *
 * The strict one is what a correct response looks like, and it is what the
 * provider asks for FIRST. When it fails, the validation error is fed back to
 * the model and it tries again — which recovers the item far more often than
 * not, because "source_quote is required" is a fixable instruction.
 *
 * Salvaging on the first attempt would silently throw that away: a single
 * malformed commitment would be dropped without ever asking the model to
 * correct it, and the person would quietly lose a promise that one more call
 * would have retrieved.
 *
 * So the lenient shape is the LAST resort, used only after the retry has also
 * failed. At that point the choice is between a partial extraction and none at
 * all — and none at all destroys the whole submission, which is the failure
 * that reached real people.
 */
const extractionShape = z.object({
  commitments: z.array(extractedCommitment).max(30).default([]),
  updates: z.array(statusUpdate).max(30).default([]),
  /** Free-text obstacles worth surfacing even if not tied to a commitment. */
  blockers: sentenceList(300, 10).default([]),
  /** Colleagues whose work the writer referenced — cheap peer evidence. */
  mentions: sentenceList(80, 20).default([]),
});

const EXTRACTION_KEYS = ["commitments", "updates", "blockers", "mentions"];

/**
 * An extraction result, and a guard against a very quiet failure.
 *
 * Every field above has a default, which is correct — a check-in that contains
 * no new commitments genuinely extracts to an empty list. But it means an
 * object sharing NONE of these keys also parses cleanly, as "found nothing".
 * So a model that answered a different question, or returned an error object,
 * would be recorded as a successful extraction of an empty week.
 *
 * The distinction that matters is between "the model looked and found
 * nothing" and "the model did not answer this question". A response mentioning
 * none of the expected fields is the second, and is rejected so the provider
 * retries and then fails loudly.
 */
export const extractionResult = z.preprocess((raw) => {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const keys = Object.keys(raw as Record<string, unknown>);
  if (!EXTRACTION_KEYS.some((k) => keys.includes(k))) {
    // Nothing recognisable. Hand the shape parser something it must reject.
    return Symbol("not-an-extraction-result");
  }
  return raw;
}, extractionShape);

/**
 * The same result, keeping whatever stands up.
 *
 * Used only on the provider's final attempt. See the note above
 * `extractionShape` for why this is not simply the schema.
 */
export const extractionResultLenient = z.preprocess((raw) => {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const keys = Object.keys(raw as Record<string, unknown>);
  if (!EXTRACTION_KEYS.some((k) => keys.includes(k))) {
    return Symbol("not-an-extraction-result");
  }
  return raw;
}, extractionShape.extend({
  commitments: salvage(extractedCommitment, "commitments", 30).default([]),
  updates: salvage(statusUpdate, "status updates", 30).default([]),
}));

export type ExtractionResult = z.infer<typeof extractionResult>;
export type ExtractedCommitment = z.infer<typeof extractedCommitment>;
export type StatusUpdate = z.infer<typeof statusUpdate>;

/** One ambiguous promise/report pair for the model to rule on. */
export const adjudication = z.object({
  commitment_id: z.string(),
  verdict: z.enum(["satisfied", "partial", "not_satisfied", "unclear"]),
  evidence_quote: z.string().max(400).optional(),
  confidence: z.number().min(0).max(1).default(0.7),
});

export const adjudicationResult = z.object({
  rulings: z.array(adjudication).max(50).default([]),
});

export type Adjudication = z.infer<typeof adjudication>;

/** Prose written from figures that SQL already computed. */
export const narrativeResult = z.object({
  narrative: z.string().max(1200),
  /*
   * Coaching, in either of the two shapes a model actually produces.
   *
   * The structured form is what the UI wants — a heading, a body, and the
   * figure that prompted it. But models reliably return a plain list of
   * sentences instead, and a schema that only accepts the richer form turns
   * that into a 500 on somebody's own week page. A bare string is the same
   * content with less packaging, so it is normalised rather than rejected.
   */
  coaching: z
    .array(
      z.union([
        z.object({
          title: z.string().max(120),
          body: z.string().max(600),
          /** Which figure prompted this, so the UI can show the evidence. */
          based_on: z.string().max(120).default(""),
        }),
        z.string().max(600).transform((body) => ({
          title: "",
          body,
          based_on: "",
        })),
      ]),
    )
    .max(4)
    .default([]),
  /**
   * Questions for the employee's correction window — chiefly about
   * commitments that went unmentioned. Asked before anything rolls upward.
   */
  questions: z.array(z.string().max(240)).max(5).default([]),
});
/*
 * What the coach is allowed to remember.
 *
 * Compact by design. The model does not need rows — it needs the handful of
 * facts that let it say "again" instead of describing this week as though it
 * were the first.
 *
 * EVERY FIELD IS OPTIONAL, and absent means absent. A first-ever week carries
 * no history at all, and the prompt is explicit that saying nothing about the
 * past is the correct output rather than an invitation to invent one.
 */
export type WeeklyHistory = {
  /** The cycle immediately before this one, when a settled one exists. */
  previous?: {
    label: string;
    delivered: number;
    promised: number;
    delivery_rate: number | null;
  };
  /** How many settled weeks exist before this one. */
  settled_weeks?: number;
  /** Delivery rates for up to the last four settled weeks, oldest first. */
  recent_delivery_rates?: number[];
  /** Work renewed rather than finished, with how many times it has moved. */
  carried?: { title: string; times: number }[];
  /** Units this person is currently waiting on. */
  waiting_on?: string[];
};



export type NarrativeResult = z.infer<typeof narrativeResult>;

export type Usage = {
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  latencyMs: number;
};

export type AiResult<T> = { data: T; usage: Usage };

export interface AiProvider {
  readonly name: string;
  readonly model: string;

  /** Untrusted human text in, structured commitments out. */
  extract(input: {
    text: string;
    openCommitments: { id: string; title: string }[];
    personName: string;
    cycleLabel: string;
  }): Promise<AiResult<ExtractionResult>>;

  /**
   * Answer a question about the organisation, from facts already counted.
   *
   * Someone is waiting and listening, so this is a fast-tier job. It reasons
   * over a fact pack rather than retrieving — the whole brief for an
   * organisation this size fits in a prompt, and a retrieval step would add
   * latency to buy nothing.
   */
  answer(input: AssistantContext): Promise<AiResult<AssistantAnswer>>;

  /**
   * Turn a loose spoken or typed update into a check-in to confirm.
   *
   * Runs while somebody waits on their own home page, so it is a fast-tier
   * job, and it returns a proposal — nothing is saved until they press submit.
   */
  draft(input: {
    text: string;
    personName: string;
    cycleLabel: string;
    openCommitments: { id: string; title: string }[];
  }): Promise<AiResult<CheckInDraft>>;

  /**
   * Tidy somebody's own words, for them to accept or reject.
   *
   * Fast tier: they are watching. It rewrites ONLY — it must not summarise,
   * add, infer or drop a fact, because the accepted text becomes
   * `check_ins.raw_text`, which the whole product treats as authorship and
   * quotes back to the Chairman as this person's own sentence.
   */
  rewrite(input: {
    text: string;
    personName: string;
  }): Promise<AiResult<CheckInRewrite>>;

  /** Rule on promise/report pairs the cheap matcher could not settle. */
  adjudicate(input: {
    report: string;
    candidates: { commitment_id: string; title: string }[];
  }): Promise<AiResult<{ rulings: Adjudication[] }>>;

  /** Write the week up from figures that are already final. */
  narrate(input: {
    personName: string;
    cycleLabel: string;
    metrics: Record<string, unknown>;
    unmentioned: string[];
    /**
     * What came before, when anything did. Absent for a first week — and the
     * prompt treats absence as "say nothing about the past".
     */
    history?: WeeklyHistory;
    calibration?: Record<string, unknown>;
  }): Promise<AiResult<NarrativeResult>>;

  /**
   * Word one outbound message for its recipient.
   *
   * Deliberately narrow: this decides how something READS, never whether it is
   * sent. Volume stays with enqueue_notification, whose daily budget, quiet
   * hours and suppression log are deterministic and tested. A model that could
   * also decide how often to speak would make the anti-spam guarantee
   * unpredictable and unauditable — and "proactive assistant" would become the
   * spam machine the guide warns about in the same breath.
   */
  tone(input: ToneContext): Promise<AiResult<ToneResult>>;

  /**
   * Write the executive briefing from figures that are already final.
   *
   * PRD F15 calls this "the single most important output of the system and the
   * requirement against which delivery is judged", and F16 requires it to
   * stand alone in an inbox. So it is prose over arithmetic somebody else did:
   * every number handed in has been computed by SQL, and the model's job is to
   * say what they mean and what to do about them.
   */
  digest(input: DigestContext): Promise<AiResult<DigestResult>>;

  embed(texts: string[]): Promise<AiResult<number[][]>>;
}

// ---------------------------------------------------------------------------
// Coordination
// ---------------------------------------------------------------------------

export const toneResult = z.object({
  /** Subject line. Short enough to read in a notification tray. */
  title: z.string().min(3).max(90),
  /** The message. One or two sentences. */
  body: z.string().min(3).max(400),
  /**
   * The single question or action being asked for, if any.
   *
   * A notification that names no next step is a status update wearing an
   * alert's clothes, and people learn to ignore those.
   */
  ask: z.string().max(160).optional(),
});

export type ToneResult = z.infer<typeof toneResult>;

/** Who a message is for, and how it should land. */
export type ToneContext = {
  /** staff | lead | hr | executive | admin */
  recipientRole: string;
  recipientName: string;
  /** What kind of thing this is: reminder, mismatch, blocker, digest... */
  kind: string;
  /** 0 critical, 1 high, 2 normal, 3 low. */
  priority: number;
  /**
   * The facts, already computed. The model rewrites around these and must not
   * introduce a figure that is not here.
   */
  facts: Record<string, unknown>;
  /**
   * Whether this concerns something the recipient may feel judged about. Sets
   * the difference between "you did not report" and "should I mark this
   * delayed?".
   */
  sensitive: boolean;
};

// ---------------------------------------------------------------------------
// The inline check-in draft
// ---------------------------------------------------------------------------

/*
 * Loose speech in, a check-in they can confirm out.
 *
 * Somebody talks or types a paragraph into the card on their home page —
 * "finished the onboarding checklist, legal is still sitting on the vendor
 * contract, next week I'll start the payments spike" — and gets back the same
 * content sorted into what happened, what is next, and what it means for the
 * commitments they already made.
 *
 * NOTHING HERE IS SAVED. It is a proposal shown for confirmation, and the
 * person can edit every part of it before anything is written. That matters
 * more here than anywhere else in the product: this is the moment their own
 * words become a record other people will read.
 */
export const checkInDraft = z.preprocess(
  (raw) => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const keys = Object.keys(raw as Record<string, unknown>);
    if (!["progress", "plan", "updates"].some((k) => keys.includes(k))) {
      return Symbol("not-a-draft");
    }
    return raw;
  },
  z.object({
    /** What happened, in their register — tidied, never invented. */
    progress: z.string().max(2000).default(""),
    /** What they said they will do next. Becomes next week's commitments. */
    plan: z.string().max(2000).default(""),

    /**
     * What they said about commitments they already had open.
     *
     * `title` must match one of the open commitments handed in, because the
     * caller resolves it back to an id — a title the model invented resolves
     * to nothing and is dropped rather than guessed at.
     */
    updates: z
      .array(
        z.object({
          title: z.string().max(200),
          status: looseStatus,
          /*
           * Did they actually SAY this changed, or is it inferred from silence?
           * The whole integrity score turns on this distinction, so it is
           * carried through the draft rather than decided at save time.
           */
          declared: z.boolean().default(true),
        }),
      )
      .max(20)
      .default([]),

    /**
     * At most one question, asked only when an answer changes what gets saved.
     *
     * Null is the common and correct answer. A form that asks something every
     * time is a form people learn to dismiss without reading.
     */
    question: z.string().max(200).nullable().default(null),
  }),
);

export type CheckInDraft = z.infer<typeof checkInDraft>;

/**
 * A tidied version of what somebody wrote, for them to accept or discard.
 *
 * NOT AN EXTRACTION. `draft` turns words into structured commitments; this
 * returns the same update in the same person's voice with the typing cleaned
 * up, and it is only ever a SUGGESTION — nothing is filed until the person
 * accepts it, and the words they authored remain theirs to keep.
 */
export const checkInRewrite = z.object({
  /** The tidied update. Same facts, same voice, same length or shorter. */
  text: z.string().min(1).max(4000),
  /**
   * True when the model judged the original already clear.
   *
   * Offering a “rewrite” identical to the input wastes the reader's
   * attention on a decision that changes nothing, so the caller says so
   * instead of showing a diff of nothing.
   */
  unchanged: z.boolean().default(false),
});

export type CheckInRewrite = z.infer<typeof checkInRewrite>;

// ---------------------------------------------------------------------------
// The assistant
// ---------------------------------------------------------------------------

/*
 * A question, answered.
 *
 * Someone asks "why is marketing behind?" and gets a real answer — not a
 * transcription of their own voice. The model is handed facts already counted
 * by SQL and writes the explanation; it is never asked what a delivery rate
 * was, because a figure a model produced is a figure an executive can catch
 * being wrong, and that happens exactly once before nobody trusts any of it.
 *
 * ONE ANSWER, NOT TWO.
 *
 * This used to carry a separate `spoken` field, written for the ear, because
 * answers were read aloud. Reading them aloud is gone — an executive scanning
 * a dashboard does not want to be talked at, and a synthesised voice reading a
 * paragraph is slower than reading it. Nothing consumed `spoken` afterwards,
 * and a field nothing consumes is a promise the schema cannot keep, so it was
 * removed rather than left behind.
 *
 * What is left is one short written answer. `detail` is capped hard on
 * purpose: the failure it is guarding against is a wall of prose that stretches
 * the page and gets skipped.
 */
export const assistantAnswer = z.preprocess(
  (raw) => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const keys = Object.keys(raw as Record<string, unknown>);
    // Same guard as everywhere else: an object sharing none of these keys
    // answered a different question and must not be read out as an answer.
    if (!["detail", "answered"].some((k) => keys.includes(k))) {
      return Symbol("not-an-answer");
    }
    return raw;
  },
  z.object({
    /**
     * The answer. Short, plain, and written to be read at a glance.
     *
     * 900 rather than the old 2500: the cap is the last line of defence
     * against the thing that made this unusable — nine sentences of prose in a
     * panel somebody was scanning.
     */
    detail: z.string().min(1).max(900),

    /**
     * The figures the answer leans on, quoted back from the facts it was
     * given. Displayed as chips, so every number on screen is traceable to a
     * row rather than to a sentence.
     */
    figures: z
      .array(z.object({ label: z.string().max(60), value: z.string().max(40) }))
      .max(6)
      .default([]),

    /** Up to three natural next questions, phrased as the person would say them. */
    followUps: z.array(z.string().max(120)).max(3).default([]),

    /**
     * False when the facts simply do not contain the answer.
     *
     * The single most important field here. An assistant that cannot say "I do
     * not have that" will invent, and an invented answer about a named
     * colleague is worse than silence — so this is explicit, and the interface
     * shows it differently.
     */
    answered: z.boolean().default(true),
  }),
);

export type AssistantAnswer = z.infer<typeof assistantAnswer>;

/** Everything the assistant is allowed to know when answering. */
export type AssistantContext = {
  askerName: string;
  askerRole: string;
  orgName: string;
  cycleLabel: string;
  question: string;
  /** Counted by SQL, scoped by RLS to what this person may see. */
  facts: Record<string, unknown>;
  /** Earlier turns, so "what about them?" resolves. */
  history: { question: string; answer: string }[];
};

// ---------------------------------------------------------------------------
// Executive digest
// ---------------------------------------------------------------------------

export const digestResult = z.object({
  /** Subject line. Says what happened, not "your weekly update". */
  subject: z.string().min(6).max(120),
  /**
   * The whole week in one sentence, for someone who reads nothing else.
   * PRD F16: the email must stand alone.
   */
  headline: z.string().min(10).max(400),
  /**
   * What changed since last week. Movement, not levels — a Chairman who reads
   * only this should know what is different.
   */
  whatChanged: z.array(z.string().max(300)).max(4).default([]),
  /** Each risk paired with the action only leadership can take. */
  decisions: z
    .array(
      z.object({
        risk: z.string().max(280),
        action: z.string().max(280),
        /** Which unit or person it concerns, for the drill-down link. */
        concerns: z.string().max(120).optional(),
      }),
    )
    .max(4)
    .default([]),
  /** Worth saying out loud. Recognition is a leadership action too. */
  praise: z.array(z.string().max(240)).max(2).default([]),

  /**
   * The week as ONE account rather than one entry per person.
   *
   * Two people who both presented the same prototype filed one organisational
   * event, not two updates. Listing it twice teaches the reader to skim, and
   * skimming is how the blocked item three entries down gets missed — the same
   * reasoning as rejected-patterns §13, arrived at from the other direction.
   *
   * `people` is what makes a thread checkable: it names whose reports it was
   * assembled from, so the Chairman can open any of them and see their own
   * words. A thread that names nobody is an assertion.
   */
  threads: z
    .array(
      z.object({
        /** What this piece of work is. Not a person's name. */
        headline: z.string().max(160),
        /** What actually happened, in one or two sentences. */
        detail: z.string().max(500),
        /** Everyone whose reports this was drawn from. */
        people: z.array(z.string().max(80)).max(8).default([]),
      }),
    )
    .max(7)
    .default([]),
});

export type DigestResult = z.infer<typeof digestResult>;

/** Everything SQL knows, handed to the model as finished fact. */
export type DigestContext = {
  orgName: string;
  cycleLabel: string;
  period: "weekly" | "monthly";
  /** Figures. Already computed; the model may not alter or recompute them. */
  metrics: Record<string, unknown>;
  /** Deterministic findings from lib/insights.ts. */
  findings: {
    type: string;
    title: string;
    summary: string;
    severity: string;
    recommendedAction: string;
  }[];
  /** Unit-level rollup, so movement can be described per team. */
  departments: {
    name: string;
    delivery: number | null;
    signal: number | null;
    reported: string;
  }[];
  /**
   * What every person reported, so the week can be told as one account.
   *
   * Read from COMMITMENTS, never from check-in text — `check_ins` is
   * author-only and stays that way. `reported: false` means they filed
   * nothing, which is not the same as an empty week and must never render the
   * same way (rule 5: silence is not a status).
   */
  people: {
    profileId: string;
    name: string;
    unit: string | null;
    reported: boolean;
    delivered: string[];
    open: string[];
    blocked: { title: string; blockingUnit: string | null }[];
    planned: string[];
  }[];
  /** The same figures a week earlier, so "what changed" is real. */
  previous?: Record<string, unknown>;
};
