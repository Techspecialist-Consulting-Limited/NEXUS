import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarClock } from "lucide-react";
import type { CommitmentRow } from "@/lib/queries";

/*
 * One person's week, for somebody who is not that person.
 *
 * WHAT THIS PAGE IS NOT.
 *
 * `rejected-patterns.md` §9 rejects "individual drill-down framed as
 * investigation rather than support", and this is exactly the shape that rule
 * warns about — so what is absent matters more than what is here. There is no
 * score on this page, no ranking, no comparison with anybody else, and no
 * word about effort or reliability. The system cannot observe those, and a
 * page that implied it could would teach the person being read about to commit
 * to less, which costs more than it tells anybody.
 *
 * What it does show is their own words. `source_quote` is verbatim — never a
 * paraphrase, never tidied — because a cleaned-up quote hides the
 * transcription error that is the person's only clue the system misheard them.
 *
 * The raw check-in is NOT here and cannot be: `check_ins` is author-only in
 * RLS. Everything below comes from commitments, which the person published.
 */

const LANDED = new Set(["delivered", "partial"]);
const OPEN = new Set(["promised", "in_progress", "deferred"]);

function Section({
  title,
  note,
  rows,
  /*
   * Outcomes belong to the week being reported on. "Taken on next" is about a
   * week this page is NOT reporting on, and stamping those rows with Delivered
   * or Partial put an outcome next to a commitment whose week had not been
   * settled — and contradicted the same item shown as still open above.
   * What they took on is the fact here; what became of it is next week's page.
   */
  showStatus = true,
}: {
  title: string;
  note?: string;
  rows: CommitmentRow[];
  showStatus?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="card-title text-primary">{title}</h2>
      {note && <p className="note mt-1">{note}</p>}
      <ul className="mt-2.5 space-y-2">
        {rows.map((c) => (
          <li
            key={c.id}
            className="rounded-lg border border-white/[0.09] bg-white/[0.02] px-3.5 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm leading-snug text-white/90">{c.title}</p>
              {showStatus && <StatusChip status={c.status} />}
            </div>

            {/*
              Their sentence, exactly as written. This is the evidence that
              makes the row checkable rather than an assertion about somebody.
            */}
            {c.source_quote && (
              <p className="body-sm mt-2 border-l-2 border-white/[0.12] pl-2.5 italic">
                &ldquo;{c.source_quote}&rdquo;
              </p>
            )}

            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {c.carry_depth > 1 && (
                <span className="note">
                  Carried {c.carry_depth} weeks — usually too large for one week
                  rather than neglected
                </span>
              )}
              {c.depends_on_department && (
                <span className="note">
                  Waiting on {c.depends_on_department} · not counted against
                  their delivery
                </span>
              )}
              {!c.was_planned && (
                <span className="note">Unplanned — arrived during the week</span>
              )}
              {showStatus && c.deviation_declared && (
                <span className="note">Flagged before the week closed</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PersonWeek({
  fullName,
  departmentName,
  cycleLabel,
  reported,
  commitments,
  planned,
}: {
  fullName: string;
  departmentName: string | null;
  /** Null until a week has settled — see the page's no-week branch. */
  cycleLabel: string | null;
  reported: boolean;
  commitments: CommitmentRow[];
  planned: CommitmentRow[];
}) {
  const landed = commitments.filter((c) => LANDED.has(c.status));
  const open = commitments.filter((c) => OPEN.has(c.status));
  const blocked = commitments.filter((c) => c.status === "blocked");

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-5 pb-2">
      <div>
        <Link
          href="/dashboard"
          className="note inline-flex min-h-11 items-center gap-1.5 hover:text-white/80"
        >
          <ArrowLeft size={13} aria-hidden="true" /> Back to Command
        </Link>
        <h1 className="page-title mt-1">{fullName}</h1>
        <p className="standfirst mt-1">
          {departmentName ?? "No unit"}
          {cycleLabel ? ` · ${cycleLabel}` : ""}
        </p>
      </div>

      {/*
        NOTHING SETTLED YET IS NOT THE SAME AS NOTHING FILED.

        Without this the branch below would say this person "did not file a
        check-in" on an organisation where nobody has been asked to yet — an
        accusation the record cannot support. rejected-patterns.md #15: an
        empty state must not assert.
      */}
      {!cycleLabel ? (
        <GlassCard level={2} className="p-6">
          <EmptyState
            icon={CalendarClock}
            title="No week has closed yet"
            body={`Nothing has been reported on for ${fullName.split(/\s+/)[0]} because no reporting week has settled. Once the first one closes, what they promised and what happened to it appears here.`}
          />
        </GlassCard>
      ) : !reported ? (
        <GlassCard level={2} className="p-6">
          <EmptyState
            icon={CalendarClock}
            title="No report was filed for this week"
            body={`${fullName.split(/\s+/)[0]} did not file a check-in for ${cycleLabel}. That is a gap in the record, not a record of their work — nothing here says what they did or did not do. Anything below was carried in from earlier weeks.`}
          />
        </GlassCard>
      ) : (
        commitments.length === 0 &&
        planned.length === 0 && (
          <GlassCard level={2} className="p-6">
            <EmptyState
              icon={CalendarClock}
              title="Nothing was recorded for this week"
              body="A check-in arrived but no commitments came out of it. That usually means the update described work already tracked elsewhere."
            />
          </GlassCard>
        )
      )}

      <GlassCard level={2} className="space-y-6 p-5 md:p-6">
        <Section title="Landed" rows={landed} />
        <Section
          title="Still open"
          note="Committed to this week and not closed by the end of it."
          rows={open}
        />
        <Section
          title="Held up"
          note="Waiting on another unit. Excluded from their delivery figure, deliberately — if it counted, people would stop declaring dependencies."
          rows={blocked}
        />
        <Section
          title="Taken on next"
          note="What they committed to for the following week. Outcomes are not shown — that week is not the one being reported on here."
          rows={planned}
          showStatus={false}
        />
      </GlassCard>

      <p className="note">
        Their own words, as written. NEXUS does not hold the check-in text
        itself — everything here is what they published as commitments.
      </p>
    </div>
  );
}
