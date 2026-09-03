import { asActor } from "./db";
import { aiProvider } from "./ai/provider";
import type { ExtractionResult } from "./ai/types";

/*
 * The intelligence loop, server side.
 *
 *   previous commitment -> employee update -> AI extraction
 *     -> mismatch/blocker detection -> employee confirmation -> roll-up
 *
 * GUIDE Implementation Mandate: "If this loop is not visible, the app is not
 * yet NEXUS. It is only a dashboard."
 *
 * Two boundaries are held here and nowhere else:
 *
 *   The raw text is written once and never rewritten (migration 0002 enforces
 *   it with a trigger, so a bug here fails loudly rather than quietly
 *   destroying what somebody wrote).
 *
 *   The extractor is only ever shown text the human authored. The assistant's
 *   own questions live in `transcript` and are deliberately not passed back
 *   into extraction — a model reading its own prior turns will happily extract
 *   commitments it invented itself.
 */

export type OpenCommitment = {
  id: string;
  title: string;
  status: string;
  source_quote: string | null;
  carry_depth: number;
};

/** What the person owes an answer on: last week's promises, still open. */
export async function openCommitments(
  actor: string,
  profileId: string,
  cycleId: string,
): Promise<OpenCommitment[]> {
  return asActor(
    actor,
    (sql) => sql<OpenCommitment>`
      select c.id, c.title, c.status::text as status, c.source_quote, 1 as carry_depth
      from commitments c
      where c.profile_id = ${profileId}
        and c.target_cycle_id = ${cycleId}
        and c.deleted_at is null
        and c.status in ('promised', 'in_progress', 'blocked', 'partial')
      order by priority_weight(c.priority) desc, c.title
    `,
  );
}

export type CheckInDraft = {
  /** Status the person set on each existing commitment, by id. */
  resolutions: { commitmentId: string; status: string; reason?: string }[];
  /** Free text: what actually happened. */
  progress: string;
  /** Free text: what is planned next. */
  plan: string;
  /**
   * Whether any of this was dictated rather than typed.
   *
   * Recorded because raw_text is quoted back to people verbatim. A
   * transcription error is a different kind of wrong from a false statement,
   * and only the capture method distinguishes them.
   */
  dictated?: boolean;
};

export type CheckInOutcome = {
  checkInId: string;
  extraction: ExtractionResult;
  /** Commitments that were never mentioned in the free text — the drift. */
  unmentioned: { id: string; title: string }[];
  /**
   * The report was SAVED but could not be understood.
   *
   * Saving and understanding are different operations and they now fail
   * separately. A model that errors, drifts in shape, or times out costs the
   * reader their structure — it must never cost the writer their words.
   */
  processingFailed?: string;
};

/**
 * Persist the report itself. Nothing here depends on a model.
 *
 * Idempotent per (profile, cycle, channel), and `raw_text` is APPENDED rather
 * than replaced — migration 0002 makes rewriting what somebody typed
 * impossible, and a retry is an addition to the record, not a correction of it.
 *
 * Status is `'responded'`: the human has replied and nothing has been parsed
 * yet. It becomes `'parsed'` once extraction lands, or `'failed'` if it does
 * not.
 */
async function saveCheckIn(
  actor: string,
  profileId: string,
  cycleId: string,
  rawText: string,
  dictated: boolean,
): Promise<string> {
  const rows = await asActor(
    actor,
    (sql) => sql<{ id: string }>`
      insert into check_ins (org_id, profile_id, cycle_id, channel, status,
                             raw_text, raw_payload, responded_at, parsed_at)
      select p.org_id, p.id, ${cycleId}, 'in_app', 'responded', ${rawText},
             -- ::text is load-bearing. jsonb_build_object is variadic "any", so
             -- Postgres has nothing to infer a bare parameter's type from and
             -- rejects the whole statement with 42P18 "could not determine data
             -- type of parameter". Every check-in submission failed on it.
             jsonb_build_object('capture', ${dictated ? "dictated" : "typed"}::text),
             now(), null
      from profiles p where p.id = ${profileId}
      on conflict (profile_id, cycle_id, channel) do update
        set raw_text = case
              when check_ins.raw_text is null then excluded.raw_text
              -- Appending is permitted; rewriting is not (migration 0002).
              else check_ins.raw_text || E'\n\n' || excluded.raw_text
            end,
            status = 'responded',
            raw_payload = excluded.raw_payload,
            responded_at = now(),
            parsed_at = null
      returning id
    `,
  );
  return rows[0].id;
}

/**
 * Record a check-in and run extraction. Returns what the AI understood so the
 * employee can confirm it BEFORE anything is persisted as fact.
 */
/*
 * A CHECK-IN IS TWO EVENTS, AND ONLY ONE OF THEM IS URGENT.
 *
 * Recording what somebody wrote is a single insert. Understanding it means a
 * round-trip to a model, and that measured 9.7 seconds against real Azure —
 * during which the browser held the connection open, the button said
 * "Filing…", and anybody whose network gave up first was told their report
 * had failed while the row sat safely in Postgres.
 *
 * So the two are separate functions now. `recordCheckIn` is what the person
 * waits for: their words, and the resolutions they tapped, both of which are
 * facts they stated and neither of which needs a model. `interpretCheckIn` is
 * what the model is for, and it runs after the response is sent.
 *
 * `submitCheckIn` still does both in order, because a caller that genuinely
 * wants to wait — the tests, a script — should not have to orchestrate it.
 */

/** What `recordCheckIn` saved, and what `interpretCheckIn` needs to read it. */
export interface RecordedCheckIn {
  checkInId: string;
  rawText: string;
  /*
   * The open set as it was BEFORE the tap resolutions landed. Drift detection
   * asks "what did nobody account for", and a commitment resolved by a tap has
   * been accounted for — but it has to be in the list to be crossed off it.
   */
  open: OpenCommitment[];
}

/**
 * Save the words and the taps. Fast, and the only part a person waits for.
 */
export async function recordCheckIn(
  actor: string,
  profileId: string,
  cycleId: string,
  draft: CheckInDraft,
): Promise<RecordedCheckIn> {
  // Only what the human typed. Never the assistant's prompts.
  const rawText = [draft.progress.trim(), draft.plan.trim()]
    .filter(Boolean)
    .join("\n\n");

  /*
   * SAVE FIRST, UNDERSTAND SECOND.
   *
   * Extraction used to run here, before the insert. When the model returned
   * `blockers` as objects rather than strings the schema rejected it, this
   * threw, and the entire submission was discarded — no row, no raw_text,
   * nothing to retry from. People lost real reports to the shape of the least
   * important field in the response.
   *
   * The order is now the one migration 0002 assumed when it defined
   * `'responded'` ("human replied, not yet parsed") and `'failed'`
   * ("extraction errored; raw_text still intact, safe to retry"). Those states
   * existed from the beginning and nothing ever wrote them.
   *
   * A model is a third party over a network. It must never sit between a
   * person and the durability of their own words.
   */
  /*
   * TOGETHER, because neither needs the other.
   *
   * These were two awaits in a row, and against a remote Postgres a round-trip
   * is most of a second — which the person spends watching a spinner for no
   * reason. The open set is only read; the insert only writes; running them at
   * once costs the slower of the two rather than the sum.
   */
  const [open, checkInId] = await Promise.all([
    openCommitments(actor, profileId, cycleId),
    saveCheckIn(actor, profileId, cycleId, rawText, draft.dictated ?? false),
  ]);
  /*
   * The taps go in now, not with the extraction.
   *
   * They are explicit declarations — somebody pressed "delivered" — so they
   * need no interpreting, and holding them behind a model would mean the
   * screen still showed work as open after the person had just closed it.
   */
  if (draft.resolutions.length > 0) {
    await asActor(actor, async (sql) => {
    // Tap resolutions are explicit declarations — that is what makes them
    // count as good signal rather than silent drift.
    for (const r of draft.resolutions) {
      await sql`
        update commitments
           set status = ${r.status}::commitment_status,
               deviation_declared = true,
               declared_at = now(),
               outcome_reason = coalesce(${r.reason ?? null}, outcome_reason),
               delivered_at = case when ${r.status} = 'delivered' then now() else delivered_at end
         where id = ${r.commitmentId} and profile_id = ${profileId}
      `;
    }

    });
  }

  return { checkInId, rawText, open };
}

/**
 * Read what was written, and record what was understood.
 *
 * Safe to run after the response: every branch leaves `raw_text` intact, and a
 * failure marks the row retryable rather than losing anything.
 */
export async function interpretCheckIn(
  actor: string,
  profileId: string,
  cycleId: string,
  nextCycleId: string,
  personName: string,
  cycleLabel: string,
  recorded: RecordedCheckIn,
  draft: CheckInDraft,
): Promise<CheckInOutcome> {
  const { checkInId, rawText, open } = recorded;

  let extraction: ExtractionResult;
  try {
    ({ data: extraction } = await aiProvider().extract({
      text: rawText,
      openCommitments: open.map((c) => ({ id: c.id, title: c.title })),
      personName,
      cycleLabel,
    }));
  } catch (error) {
    /*
     * Recorded, not swallowed. `raw_text` is intact and the row is marked
     * retryable, so the words survive and the failure is visible rather than
     * being reported to the person as success.
     */
    await asActor(actor, (sql) => sql`
      update check_ins set status = 'failed', parsed_at = null where id = ${checkInId}
    `);
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[nexus] check-in ${checkInId} saved but extraction failed: ${detail}`);
    return {
      checkInId,
      extraction: { commitments: [], updates: [], blockers: [], mentions: [] },
      unmentioned: [],
      processingFailed: detail,
    };
  }

  /*
   * Drift detection. A commitment the person neither resolved with a tap nor
   * mentioned in their own words has gone quiet — and going quiet is precisely
   * what this product exists to notice. It becomes a question, asked of the
   * employee first.
   */
  const touched = new Set<string>(draft.resolutions.map((r) => r.commitmentId));
  for (const update of extraction.updates) {
    const match = open.find(
      (c) => c.title.toLowerCase() === update.commitment_title.toLowerCase(),
    );
    if (match) touched.add(match.id);
  }
  const unmentioned = open
    .filter((c) => !touched.has(c.id))
    .map((c) => ({ id: c.id, title: c.title }));

  /*
   * Now that the words are safe, record what was understood. A failure from
   * here leaves the report saved and re-processable rather than destroyed.
   */
  await asActor(actor, async (sql) => {

    // New promises land against next week, carrying the sentence they came from.
    for (const c of extraction.commitments) {
      const target = c.targets === "this_cycle" ? cycleId : nextCycleId;
      await sql`
        insert into commitments
          (org_id, profile_id, department_id, source_check_in_id, source_quote,
           extraction_confidence, title, description, category, priority,
           estimated_effort_hours, created_cycle_id, target_cycle_id,
           status, was_planned)
        select p.org_id, p.id, p.department_id, ${checkInId}, ${c.source_quote},
               ${c.confidence}, ${c.title}, ${c.description ?? null},
               ${c.category ?? null}, ${c.priority}::commitment_priority,
               ${c.estimated_effort_hours ?? null}, ${cycleId}, ${target},
               'promised', true
        from profiles p where p.id = ${profileId}
        /*
         * A retry refreshes the promise; it does not make a second one.
         * Migration 0020 added the matching partial index, and the WHERE
         * clause here has to mirror it exactly or Postgres cannot infer which
         * index to use.
         *
         * Status is deliberately NOT reset. If the person has since marked
         * this delivered or blocked, a re-submission of the same words must
         * not quietly drag it back to 'promised' — the later statement about
         * the work is the truer one.
         */
        on conflict (profile_id, target_cycle_id, (lower(btrim(title))))
          where deleted_at is null and status not in ('superseded', 'dropped')
        do update set
          source_quote          = excluded.source_quote,
          source_check_in_id    = excluded.source_check_in_id,
          description           = coalesce(excluded.description, commitments.description),
          category              = coalesce(excluded.category, commitments.category),
          priority              = excluded.priority,
          extraction_confidence = excluded.extraction_confidence,
          updated_at            = now()
      `;
    }

    await sql`
      update check_ins set status = 'parsed', parsed_at = now() where id = ${checkInId}
    `;
  });

  return { checkInId, extraction, unmentioned };
}

/** Record and interpret, in order. For callers that want the whole outcome. */
export async function submitCheckIn(
  actor: string,
  profileId: string,
  cycleId: string,
  nextCycleId: string,
  personName: string,
  cycleLabel: string,
  draft: CheckInDraft,
): Promise<CheckInOutcome> {
  const recorded = await recordCheckIn(actor, profileId, cycleId, draft);
  return interpretCheckIn(
    actor,
    profileId,
    cycleId,
    nextCycleId,
    personName,
    cycleLabel,
    recorded,
    draft,
  );
}
