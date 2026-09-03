"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, FileText, RefreshCw } from "lucide-react";
import type { ActivityEntry, LiveCommitment } from "@/lib/queries";
import { statusBadge } from "@/lib/design-tokens";
import { weekLabel } from "@/lib/cycle";
import { whenLabel } from "@/lib/when";
import { commitmentSummary, reportSummary } from "@/lib/summarise";
import { ActivityDetailDialog } from "@/components/myweek/activity-detail-dialog";

/*
 * "Your work this week" — one unified grid replacing the old two-column split
 * between "Recent activity" and "What you're working on".
 *
 * THE PROBLEM THIS SOLVES.
 *
 * The same commitments appeared in both sections: the activity stream showed
 * everything that moved, the working-on card showed everything still open, and
 * any commitment that was both open AND recently moved was rendered twice —
 * same title, same summary, same status, in two competing lists. A person
 * scanning their week read the same fact in two places and learned nothing
 * new the second time.
 *
 * THE FIX.
 *
 * One grid. Activity entries lead (they are what happened); any live
 * commitment not already represented is appended. The result is a single
 * source of truth for "what is going on with my work".
 *
 * COMPACT CARDS. Two per row on desktop, one on a phone. Each card carries
 * the minimum needed to decide "do I want to read more": title, a summary
 * line, status, and a timestamp. Full details live in the modal, which is
 * what a press opens.
 *
 * NO DUPLICATION, NO INVENTION.
 *
 * Every field is a column in `commitments` or `check_ins`, or a derived
 * value from `commitmentSummary` / `reportSummary`. No progress
 * percentages, no time tracking, no "last activity" beyond what the
 * application itself wrote (rejected-patterns.md #11).
 */

function summaryOf(entry: ActivityEntry): string | null {
  return entry.kind === "report"
    ? reportSummary(entry.raw_text)
    : commitmentSummary(entry);
}

type WorkFilter = "all" | "pending" | "blocked" | "done";

const filters: { value: WorkFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];

export function WorkGrid({
  activity,
  live,
  hasReported,
}: {
  /** Commitments that moved + reports filed, merged and newest first. */
  activity: ActivityEntry[];
  /** Everything still open, whichever week it was promised for. */
  live: LiveCommitment[];
  /** Whether they have filed for the week on screen. */
  hasReported: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<WorkFilter>("all");
  const [isScrollable, setIsScrollable] = useState(false);

  /*
   * MERGE, THEN DEDUPLICATE.
   *
   * Activity leads because it is ordered by movement — what happened most
   * recently is at the top. Any live commitment whose id is not already in
   * the activity list is appended: it is open work that has not moved
   * recently, and it still belongs in a view that answers "what is going on".
   *
   * The identity is `id`, not title — the same title can appear in multiple
   * commitment rows across weeks, and deduplicating by title would hide that
   * the same promise keeps being made.
   */
  const items = useMemo(() => {
    const activityIds = new Set(
      activity.filter((e) => e.kind === "commitment").map((e) => e.id),
    );
    const missing = live
      .filter((c) => !activityIds.has(c.id))
      .map(
        (c): ActivityEntry => ({
          ...c,
          kind: "commitment",
          at: c.delivered_at ?? c.declared_at ?? c.created_at,
        }),
      );
    return [...activity, ...missing];
  }, [activity, live]);

  const selected = useMemo(
    () => items.find((e) => `${e.kind}:${e.id}` === openId) ?? null,
    [items, openId],
  );

  const liveMap = useMemo(() => new Map(live.map((c) => [c.id, c])), [live]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;

    return items.filter(
      (entry) =>
        entry.kind === "commitment" &&
        (filter === "pending"
          ? entry.status === "promised" || entry.status === "in_progress"
          : filter === "blocked"
            ? entry.status === "blocked"
            : entry.status === "delivered"),
    );
  }, [filter, items]);

  const visibleItems = isScrollable ? filteredItems : filteredItems.slice(0, 4);
  const canViewMore = filteredItems.length > 4;

  if (items.length === 0) {
    return (
      <section aria-label="Your work this week">
        <h2 className="eyebrow mb-3">Your work this week</h2>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-5 py-8 text-center">
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
              className="nx-focus-ring mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[var(--nx-primary)] px-4 text-sm font-medium text-[var(--on-accent)] transition-opacity hover:opacity-90"
            >
              Check in
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Your work this week">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="eyebrow">Your work this week</h2>
        <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1">
          <div
            aria-label="Filter work"
            className="flex shrink-0 items-center rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5"
            role="group"
          >
            {filters.map((option) => {
              const selected = filter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setFilter(option.value);
                    setIsScrollable(false);
                  }}
                  className={`nx-focus-ring min-h-9 rounded-md px-2.5 text-2xs font-medium transition-colors ${
                    selected
                      ? "bg-[var(--nx-primary)] text-[var(--on-accent)]"
                      : "text-[var(--nx-text-secondary)] hover:bg-white/[0.06] hover:text-[var(--nx-text-primary)]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <span className="note hidden whitespace-nowrap xl:inline">
            Press any entry for the full record
          </span>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-5 py-8 text-center">
          <p className="text-[15px] font-medium text-[var(--nx-text-primary)]">
            Nothing in this view
          </p>
          <p className="mx-auto mt-1.5 max-w-[46ch] text-sm leading-relaxed text-[var(--nx-text-secondary)]">
            Choose another filter to see more of your week.
          </p>
        </div>
      ) : (
        <div
          className={
            isScrollable
              ? "max-h-[31rem] overflow-y-auto overscroll-contain pr-1"
              : ""
          }
        >
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visibleItems.map((entry) => {
              const live = liveMap.get(entry.id);
              return (
                <li key={`${entry.kind}:${entry.id}`} className="list-none">
                  <WorkCard
                    entry={entry}
                    carryWeeks={live?.carry_weeks}
                    isCurrentWeek={live?.is_current_week}
                    onOpen={() => setOpenId(`${entry.kind}:${entry.id}`)}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {canViewMore && (
        <button
          type="button"
          aria-expanded={isScrollable}
          onClick={() => setIsScrollable((current) => !current)}
          className="nx-focus-ring mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--nx-primary-light)] transition-opacity hover:opacity-80"
        >
          {isScrollable ? "Show less" : "View more"}
          {isScrollable ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <ArrowRight size={14} aria-hidden="true" />
          )}
        </button>
      )}

      <ActivityDetailDialog
        entry={selected}
        open={Boolean(selected)}
        onClose={() => setOpenId(null)}
      />
    </section>
  );
}

/*
 * One piece of work as a compact, clickable card.
 *
 * LAYOUT, TOP TO BOTTOM:
 *
 *   1. Status dot + title (the strongest element)
 *   2. Summary line (truncated to two lines — full content is in the modal)
 *   3. Status label + target week (if not the current week)
 *   4. Timestamp + "View details →" action
 *
 * The card is the click target. There is no separate "open" button — the
 * whole card is a <button>, the same pattern ActivityCard and TaskRow use.
 * A separate icon target is a 15px hit area pretending to be interactive
 * (see activity-stream.tsx for the full reasoning).
 */
function WorkCard({
  entry,
  carryWeeks,
  isCurrentWeek,
  onOpen,
}: {
  entry: ActivityEntry;
  carryWeeks?: number;
  isCurrentWeek?: boolean;
  onOpen: () => void;
}) {
  const isReport = entry.kind === "report";
  const badge = isReport ? null : statusBadge(entry.status);
  const title = isReport
    ? `Report · ${weekLabel(entry.cycle_label)}`
    : entry.title;
  const summary = summaryOf(entry);
  const when = whenLabel(entry.at);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="nx-focus-ring group flex h-full w-full flex-col rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-left transition-colors hover:border-white/[0.14] hover:bg-white/[0.05]"
    >
      {/* Title row — status dot + title + optional carry badge */}
      <div className="flex items-start gap-2.5">
        {isReport ? (
          <FileText
            size={14}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-[var(--nx-text-muted)]"
          />
        ) : (
          <span
            aria-hidden="true"
            className="mt-[7px] size-2 shrink-0 rounded-full"
            style={{ background: badge!.tone }}
          />
        )}
        <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-[var(--nx-text-primary)]">
          {title}
        </span>
        {carryWeeks != null && carryWeeks > 1 && (
          <span
            title={`Open for ${carryWeeks} weeks`}
            className="shrink-0 whitespace-nowrap rounded-md bg-[var(--nx-warning)]/12 px-1.5 py-0.5 text-2xs font-medium text-[var(--nx-warning)]"
          >
            <RefreshCw
              size={10}
              className="mr-0.5 inline align-[-1px]"
              aria-hidden="true"
            />
            {carryWeeks}w
          </span>
        )}
      </div>

      {/* Summary — the best available line, truncated */}
      {summary && (
        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[var(--nx-text-secondary)]">
          {summary}
        </p>
      )}

      {/* Status + target week context */}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-2xs text-[var(--nx-text-secondary)]">
          {isReport ? "Filed" : badge!.label}
        </span>
        {!isReport &&
          isCurrentWeek === false &&
          entry.kind === "commitment" && (
            <span className="text-2xs text-[var(--nx-text-muted)]">
              · for {weekLabel(entry.target_label)}
            </span>
          )}
      </div>

      {/* Timestamp + view action — pushed to the bottom */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/[0.05] pt-2.5">
        <span className="text-2xs text-[var(--nx-text-muted)]">
          {when ? `Updated ${when}` : ""}
        </span>
        <span className="text-2xs font-medium text-[var(--nx-primary)] opacity-60 transition-opacity group-hover:opacity-100">
          View details →
        </span>
      </div>
    </button>
  );
}
