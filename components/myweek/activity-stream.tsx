"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import type { ActivityEntry } from "@/lib/queries";
import { statusBadge } from "@/lib/design-tokens";
import { weekLabel } from "@/lib/cycle";
import { whenLabel } from "@/lib/when";
import { commitmentSummary, reportSummary } from "@/lib/summarise";
import { ActivityDetailDialog } from "@/components/myweek/activity-detail-dialog";

/*
 * "Recent activity" — what this person has actually been doing.
 *
 * THE QUESTION THIS ANSWERS, AND THE ONE IT DOES NOT.
 *
 * My Week asks "what have I been doing recently"; Pending Tasks asks "what do
 * I still need to work on". They were previously the same list — /my-week's
 * "what you're working on" and /commitments were both `liveCommitments`, the
 * open set — so the product had two pages answering one question and none
 * answering the other. A delivered commitment is the single most relevant
 * thing that happened to somebody's week and the open set is precisely where
 * it cannot appear.
 *
 * So this stream is ordered by MOVEMENT, includes finished work, and mixes in
 * the reports they filed, because both are things that happened. See
 * `recentActivity` and `recentReports` in lib/queries.ts.
 *
 * SUMMARY, THEN THE WHOLE THING ON DEMAND.
 *
 * A card carries a title, one line, and when it moved. Everything else is
 * behind a press. The line is never generated and never truncated at a word
 * boundary that changes its meaning — it is the first sentence of a field the
 * person or the extractor already wrote, and a card with nothing to summarise
 * shows no line rather than a manufactured one.
 */

function summaryOf(entry: ActivityEntry): string | null {
  return entry.kind === "report"
    ? reportSummary(entry.raw_text)
    : commitmentSummary(entry);
}

export function ActivityStream({
  entries,
  hasReported,
}: {
  entries: ActivityEntry[];
  /** Whether they have filed for the week on screen. Decides the empty state. */
  hasReported: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const selected = useMemo(
    () => entries.find((e) => `${e.kind}:${e.id}` === openId) ?? null,
    [entries, openId],
  );

  return (
    <section aria-label="Recent activity" className="nx-card flex flex-col p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--nx-text-primary)]">
          Recent activity
        </h2>
        {/*
          Not a count. The list is right below and states itself; a number
          above it is one more thing that can disagree with it
          (rejected-patterns.md #4).
        */}
        <span className="note">Press any entry for the full record</span>
      </div>

      {entries.length === 0 ? (
        <Empty hasReported={hasReported} />
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={`${entry.kind}:${entry.id}`}>
              <ActivityCard
                entry={entry}
                onOpen={() => setOpenId(`${entry.kind}:${entry.id}`)}
              />
            </li>
          ))}
        </ul>
      )}

      <ActivityDetailDialog
        entry={selected}
        open={Boolean(selected)}
        onClose={() => setOpenId(null)}
      />
    </section>
  );
}

function ActivityCard({
  entry,
  onOpen,
}: {
  entry: ActivityEntry;
  onOpen: () => void;
}) {
  const summary = summaryOf(entry);
  const when = whenLabel(entry.at);

  const isReport = entry.kind === "report";
  const badge = isReport ? null : statusBadge(entry.status);

  const title = isReport
    ? `Report · ${weekLabel(entry.cycle_label)}`
    : entry.title;

  return (
    <button
      type="button"
      onClick={onOpen}
      /*
        THE WHOLE CARD IS THE TARGET. A chevron in the corner of a card whose
        body is inert is a 15px hit area pretending to be a row — and on a
        phone it is the only part anybody aims at. There is nothing else
        interactive inside, so a plain <button> is correct here and the
        absolutely-positioned overlay TaskRow needs is not.
      */
      className="nx-focus-ring group flex w-full items-start gap-3 rounded-xl border
                 border-white/[0.07] bg-white/[0.02] px-3.5 py-3 text-left
                 transition-colors hover:border-white/[0.14] hover:bg-white/[0.05]"
    >
      {/*
        Kind on the left, state on the right. A report has no status — it is
        not a piece of work — so it carries the one mark that says what it is
        instead of borrowing a status colour that would mean nothing.
      */}
      {isReport ? (
        <FileText
          size={15}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-[var(--nx-text-muted)]"
        />
      ) : (
        <span
          aria-hidden="true"
          className="mt-[7px] size-2.5 shrink-0 rounded-full"
          style={{ background: badge!.tone }}
        />
      )}

      <span className="min-w-0 flex-1">
        {/* Never clamped — a task title is not allowed to be truncated. */}
        <span className="block text-[15px] font-medium leading-snug text-[var(--nx-text-primary)]">
          {title}
        </span>
        {summary && (
          <span className="mt-1 block text-[13px] leading-relaxed text-[var(--nx-text-secondary)]">
            {summary}
          </span>
        )}
        <span className="mt-1 block text-2xs text-[var(--nx-text-secondary)]">
          {isReport ? "Filed" : badge!.label}
          {when && ` · ${when}`}
        </span>
      </span>
    </button>
  );
}

/*
 * WHAT AN EMPTY STREAM MEANS, which is one of two things and never a claim
 * about the week itself (rejected-patterns.md #15).
 */
function Empty({ hasReported }: { hasReported: boolean }) {
  return (
    <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-5 py-8 text-center">
      <p className="text-[15px] font-medium text-[var(--nx-text-primary)]">
        {hasReported ? "Nothing has moved yet" : "Nothing recorded yet"}
      </p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-sm leading-relaxed text-[var(--nx-text-secondary)]">
        {hasReported
          ? "You have filed for this week. Your commitments appear here as they move."
          : "Your reports and the work they turn into show up here."}
      </p>
      {!hasReported && (
        <Link
          href="/check-in"
          className="nx-focus-ring mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg
                     bg-[var(--nx-primary)] px-4 text-sm font-medium text-[var(--on-accent)]
                     transition-opacity hover:opacity-90"
        >
          Check in
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
