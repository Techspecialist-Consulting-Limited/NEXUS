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
 *
 * FOUR PANELS IN A ROW, NOT FOUR SECTIONS IN A COLUMN.
 *
 * Reading "what shipped" against "what's coming next" used to mean scrolling
 * past Still open and Held up to get there. Side by side, each with its own
 * scroll, both are visible at once without one list's length pushing the
 * others down the page. Four columns need real width — this used to switch
 * on at `lg` (1024px), which is exactly wide enough to wrap every title into
 * single words rather than show them, the same failure the unit board hit at
 * tablet width. `xl` (1280px) is where four columns actually have room; `md`
 * to `xl` gets two instead of jumping straight from one to four. Below `md`
 * this reverts to the original stacked reading order, which is still the
 * right shape for a phone.
 */

const DELIVERED = new Set(["delivered", "partial"]);
const OPEN = new Set(["promised", "in_progress", "deferred"]);

function Panel({
  title,
  note,
  rows,
  emptyNote,
  /*
   * Outcomes belong to the week being reported on. "Taken on next" is about a
   * week this page is NOT reporting on, and stamping those rows with Delivered
   * or Partial put an outcome next to a commitment whose week had not been
   * settled — and contradicted the same item shown as still open above.
   * What they took on is the fact here; what became of it is next week's page.
   */
  showStatus = true,
  showDuration = false,
}: {
  title: string;
  note?: string;
  rows: CommitmentRow[];
  emptyNote: string;
  showStatus?: boolean;
  /**
   * Always state how long this has been open, even for a first-week item.
   * Only meaningful for Still open — Delivered and Held up already say
   * "carried" when it matters, and Taken on next has not been open at all
   * yet.
   */
  showDuration?: boolean;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-lg border border-white/[0.08] bg-white/[0.02] xl:h-[540px]">
      <div className="shrink-0 border-b border-white/[0.07] px-3.5 py-3">
        <h2 className="card-title text-primary">{title}</h2>
        {note && <p className="note mt-1">{note}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        {rows.length === 0 ? (
          <p className="note">{emptyNote}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((c, i) => (
              <li
                key={c.id}
                className="rounded-lg border border-white/[0.09] bg-white/[0.02] px-3.5 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm leading-snug text-white/90">
                    <span className="metric mr-1.5 text-tertiary">{i + 1}.</span>
                    {c.title}
                  </p>
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
                  {showDuration ? (
                    <span
                      className="text-2xs font-medium"
                      style={{ color: "var(--color-warning)" }}
                    >
                      Open {c.carry_depth} {c.carry_depth === 1 ? "week" : "weeks"}
                      {c.carry_depth > 1
                        ? " — usually too large for one week rather than neglected"
                        : ""}
                    </span>
                  ) : (
                    c.carry_depth > 1 && (
                      <span className="text-2xs text-secondary">
                        Carried {c.carry_depth} weeks — usually too large for one week
                        rather than neglected
                      </span>
                    )
                  )}
                  {/*
                    THE DEPARTMENT TAG IS STRUCTURED DATA FROM WHEN THIS WAS
                    FIRST EXTRACTED, AND IT GOES STALE.
                    Nothing re-derives `depends_on_department_id` when a
                    person later re-declares why something is blocked — the
                    tap/status flow only ever writes `outcome_reason` — so a
                    commitment first blamed on HR and since re-explained as
                    "blocked by the financial team" kept showing "Waiting on
                    HR" forever, flatly contradicting the sentence right next
                    to it. Their own, more recent words win.
                  */}
                  {!c.outcome_reason && c.depends_on_department && (
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

                {/* Why, in their own words — from the status update itself, not extraction. */}
                {c.outcome_reason && (
                  <p className="note mt-1.5 leading-relaxed">{c.outcome_reason}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
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
  const delivered = commitments.filter((c) => DELIVERED.has(c.status));
  const open = commitments.filter((c) => OPEN.has(c.status));
  const blocked = commitments.filter((c) => c.status === "blocked");
  const firstName = fullName.split(/\s+/)[0];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 pb-2">
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
            body={`Nothing has been reported on for ${firstName} because no reporting week has settled. Once the first one closes, what they promised and what happened to it appears here.`}
          />
        </GlassCard>
      ) : !reported ? (
        <GlassCard level={2} className="p-6">
          <EmptyState
            icon={CalendarClock}
            title="No report was filed for this week"
            body={`${firstName} did not file a check-in for ${cycleLabel}. That is a gap in the record, not a record of their work — nothing here says what they did or did not do. Anything below was carried in from earlier weeks.`}
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

      <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-4">
        <Panel
          title="Delivered"
          rows={delivered}
          emptyNote={`Nothing delivered by ${firstName} this week.`}
        />
        <Panel
          title="Still open"
          note="Committed to this week and not closed by the end of it."
          rows={open}
          emptyNote="Nothing still open."
          showDuration
        />
        <Panel
          title="Held up"
          note="Waiting on another unit. Excluded from their delivery figure, deliberately — if it counted, people would stop declaring dependencies."
          rows={blocked}
          emptyNote="Nothing held up by another team."
        />
        <Panel
          title="Taken on next"
          note="What they committed to for the following week. Outcomes are not shown — that week is not the one being reported on here."
          rows={planned}
          emptyNote="Nothing taken on for next week yet."
          showStatus={false}
        />
      </div>

      <p className="note">
        Their own words, as written. NEXUS does not hold the check-in text
        itself — everything here is what they published as commitments.
      </p>
    </div>
  );
}
