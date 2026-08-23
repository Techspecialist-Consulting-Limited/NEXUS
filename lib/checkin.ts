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
};

/**
 * Record a check-in and run extraction. Returns what the AI understood so the
 * employee can confirm it BEFORE anything is persisted as fact.
 */
export async function submitCheckIn(
  actor: string,
  profileId: string,
  cycleId: string,
  nextCycleId: string,
  personName: string,
  cycleLabel: string,
  draft: CheckInDraft,
): Promise<CheckInOutcome> {
  const open = await openCommitments(actor, profileId, cycleId);

  // Only what the human typed. Never the assistant's prompts.
  const rawText = [draft.progress.trim(), draft.plan.trim()]
    .filter(Boolean)
    .join("\n\n");

  const { data: extraction } = await aiProvider().extract({
    text: rawText,
    openCommitments: open.map((c) => ({ id: c.id, title: c.title })),
    personName,
    cycleLabel,
  });

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

  const checkInId = await asActor(actor, async (sql) => {
    const rows = await sql<{ id: string }>`
      insert into check_ins (org_id, profile_id, cycle_id, channel, status,
                             raw_text, raw_payload, responded_at, parsed_at)
      select p.org_id, p.id, ${cycleId}, 'in_app', 'parsed', ${rawText},
             -- ::text is load-bearing. jsonb_build_object is variadic "any", so
             -- Postgres has nothing to infer a bare parameter's type from and
             -- rejects the whole statement with 42P18 "could not determine data
             -- type of parameter". Every check-in submission failed on it.
             jsonb_build_object('capture', ${draft.dictated ? "dictated" : "typed"}::text),
             now(), now()
      from profiles p where p.id = ${profileId}
      on conflict (profile_id, cycle_id, channel) do update
        set raw_text = case
              when check_ins.raw_text is null then excluded.raw_text
              -- Appending is permitted; rewriting is not (migration 0002).
              else check_ins.raw_text || E'\n\n' || excluded.raw_text
            end,
            status = 'parsed',
            raw_payload = excluded.raw_payload,
            responded_at = now(),
            parsed_at = now()
      returning id
    `;
    const id = rows[0].id;

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

    // New promises land against next week, carrying the sentence they came from.
    for (const c of extraction.commitments) {
      const target = c.targets === "this_cycle" ? cycleId : nextCycleId;
      await sql`
        insert into commitments
          (org_id, profile_id, department_id, source_check_in_id, source_quote,
           extraction_confidence, title, description, category, priority,
           estimated_effort_hours, created_cycle_id, target_cycle_id,
           status, was_planned)
        select p.org_id, p.id, p.department_id, ${id}, ${c.source_quote},
               ${c.confidence}, ${c.title}, ${c.description ?? null},
               ${c.category ?? null}, ${c.priority}::commitment_priority,
               ${c.estimated_effort_hours ?? null}, ${cycleId}, ${target},
               'promised', true
        from profiles p where p.id = ${profileId}
      `;
    }

    return id;
  });

  return { checkInId, extraction, unmentioned };
}
