"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState } from "@/components/ui/empty-state";
import { weekRange } from "@/lib/cycle";
import { unitTone, unitWash } from "@/lib/unit-tone";
import type { ComplianceRow } from "@/lib/team";
import type { StaffUpdate } from "@/lib/queries";

/*
 * Every report for one settled week — reached from the Chairman's dashboard,
 * where "Recent updates" only ever showed the newest three.
 *
 * A TABLE, NOT A FEED OF CARDS. This is a roster — comparable rows of name,
 * department, status and a snippet — which is what a table reads better than
 * a stack of cards, especially once search and pagination are real
 * requirements rather than someday-maybe ones. No literal <table> exists
 * anywhere else in this codebase (team-manager.tsx's roster is the closest
 * precedent), so this follows that same row-as-card convention rather than
 * introducing native table chrome that would look like a different product.
 *
 * ONE LIST, NOT TWO. Missing and reported used to be separate sections; a
 * single searchable, paginated list needs one ranking instead — missing
 * first (rejected-patterns.md #12's "chase these first"), alphabetical
 * within each group.
 *
 * "NO REPORT" NEVER ASSERTS MORE THAN THE ROW SUPPORTS. A silent week is a
 * gap in the record, not evidence of what happened — rejected-patterns.md
 * #10 and #15.
 */

export type UpdateRow = ComplianceRow & { update: StaffUpdate | null };

const PAGE_SIZE = 15;

function Avatar({ name, unit }: { name: string; unit: string | null }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-full text-2xs font-semibold"
      style={{ background: unitWash(unit), color: unitTone(unit) }}
    >
      {initials}
    </span>
  );
}

/** "12m ago", "1h ago", "3d ago" — relative, because the exact clock time is noise. */
function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d ago` : `${Math.round(days / 7)}w ago`;
}

function ReportRow({ row }: { row: UpdateRow }) {
  const u = row.update;
  const snippet = u
    ? (u.source_quote ?? u.title)
    : row.submitted
      ? "Reported, but no commitments were recorded from it."
      : "No report was filed for this week.";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3">
      <div className="flex min-w-0 items-center gap-2.5" style={{ flexBasis: "220px", flexGrow: 1 }}>
        <Avatar name={row.full_name} unit={row.department_name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white/90">{row.full_name}</p>
          <p className="truncate text-xs text-secondary">{row.department_name ?? "Unassigned"}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5" style={{ flexBasis: "110px" }}>
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: row.submitted ? "var(--color-healthy)" : "var(--color-blocked)" }}
        />
        <span
          className="text-xs"
          style={{ color: row.submitted ? undefined : "var(--color-warning)" }}
        >
          {row.submitted ? "Reported" : "No report"}
        </span>
      </div>

      <p className="min-w-0 truncate text-sm text-white/80" style={{ flexBasis: "280px", flexGrow: 2 }}>
        {snippet}
      </p>

      {row.responded_at && (
        <span className="metric hidden shrink-0 text-2xs text-tertiary sm:block">
          {ago(row.responded_at)}
        </span>
      )}

      <Link
        href={`/people/${row.profile_id}`}
        className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-white/[0.10]
                   px-2.5 text-xs text-white/80 transition-colors hover:bg-white/[0.06]
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
      >
        View <ArrowRight size={12} aria-hidden="true" />
      </Link>
    </div>
  );
}

export function AllUpdates({
  cycleLabel,
  rows,
}: {
  cycleLabel: string;
  rows: UpdateRow[];
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const missingCount = rows.filter((r) => !r.submitted).length;

  const ranked = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.submitted !== b.submitted) return a.submitted ? 1 : -1;
        return a.full_name.localeCompare(b.full_name);
      }),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter((r) => r.full_name.toLowerCase().includes(q));
  }, [ranked, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  function onQueryChange(value: string) {
    setQuery(value);
    setPage(0);
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 pb-2">
      <div>
        <Link
          href="/dashboard"
          className="note inline-flex min-h-11 items-center gap-1.5 hover:text-white/80"
        >
          ← Back to Command
        </Link>
        <h1 className="page-title mt-1">Reports</h1>
        <p className="standfirst mt-1">
          {weekRange(cycleLabel)} ·{" "}
          {missingCount > 0
            ? `${missingCount} ${missingCount === 1 ? "person hasn't" : "people haven't"} reported`
            : "Everyone reported"}
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search by name"
          aria-label="Search reports by name"
          className="h-11 w-full rounded-lg border border-white/[0.10] bg-white/[0.03] pl-9 pr-3
                     text-sm text-white/90 placeholder:text-white/30
                     focus:border-white/25 focus:outline-none"
        />
      </div>

      <GlassCard level={2} className="p-2 md:p-3">
        {pageRows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Search}
              title="No match"
              body={`Nobody named "${query}" is in this week's roster.`}
            />
          </div>
        ) : (
          <ul className="flex flex-col">
            {pageRows.map((row, i) => (
              <li
                key={row.profile_id}
                style={{ borderTop: i === 0 ? undefined : "1px solid var(--nx-border)" }}
              >
                <ReportRow row={row} />
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <p className="note">
            Page {clampedPage + 1} of {totalPages} · {filtered.length}{" "}
            {filtered.length === 1 ? "person" : "people"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={clampedPage === 0}
              onClick={() => setPage((p) => p - 1)}
              className="inline-flex min-h-9 items-center rounded-md border border-white/[0.10]
                         px-3 text-xs text-white/80 transition-colors hover:bg-white/[0.06]
                         disabled:opacity-35 disabled:hover:bg-transparent"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={clampedPage >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex min-h-9 items-center rounded-md border border-white/[0.10]
                         px-3 text-xs text-white/80 transition-colors hover:bg-white/[0.06]
                         disabled:opacity-35 disabled:hover:bg-transparent"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
