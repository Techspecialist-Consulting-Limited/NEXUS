import Link from "next/link";
import { ArrowLeft, Ban, ChevronRight, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarClock } from "lucide-react";
import { weekRange } from "@/lib/cycle";
import { blockerLabel } from "@/lib/blocker";
import { unitTone, unitWash } from "@/lib/unit-tone";
import { WeekSwitcher } from "@/components/executive/week-switcher";
import type { BlockingEdge, Department, DepartmentCommitmentRow } from "@/lib/queries";

/*
 * The Chairman's unit board — every commitment in a department, at once,
 * organised the way work actually moves rather than by who reported what.
 *
 * THREE COLUMNS, AND WHY THOSE THREE.
 *
 * Backlog / Pending / Completed map onto `commitment_status` exactly:
 * Backlog is `promised` (stated, not started). Pending is `in_progress`,
 * `deferred` and `blocked` — three different reasons a thing is still open,
 * which is why a blocked row says what it is waiting on rather than leaving
 * "pending" as a single unexplained bucket. Completed is `delivered` and
 * `partial`, kept visually distinct because landing half of something is not
 * the same fact as landing all of it.
 *
 * `dropped` and `superseded` are neither — they are the record of what is no
 * longer live, not work to act on — so they sit behind a closed disclosure
 * rather than a fourth column with the same visual weight as the other three.
 *
 * GROUPED BY PERSON, NEVER RANKED. rejected-patterns.md #9 rejects individual
 * drill-down framed as investigation; this reads as "here is the work",
 * ordered alphabetically within a column, never by a score or a delivery
 * rate. Clicking a name opens their own week (`/people/:id`) for the fuller
 * picture — what they took on next, whether they reported at all — rather
 * than duplicating that page's careful empty-state handling here.
 *
 * A COMMITMENT ROW IS A <details>, NOT A CLIENT COMPONENT. Expand-in-place to
 * read the source quote is the one interaction this board needs, and the
 * platform already has a disclosure widget for exactly that — no JavaScript,
 * no "use client" boundary, keyboard support for free.
 */

const COLUMNS = [
  {
    key: "backlog",
    title: "Backlog",
    hint: "Promised, not started yet.",
    statuses: new Set(["promised"]),
  },
  {
    key: "pending",
    title: "Pending",
    hint: "In progress, deferred, or blocked.",
    statuses: new Set(["in_progress", "deferred", "blocked"]),
  },
  {
    key: "completed",
    title: "Completed",
    hint: "Landed, in full or in part.",
    statuses: new Set(["delivered", "partial"]),
  },
] as const;

const RETIRED = new Set(["dropped", "superseded"]);

function groupByPerson(rows: DepartmentCommitmentRow[]) {
  const map = new Map<
    string,
    { profileId: string; fullName: string; rows: DepartmentCommitmentRow[] }
  >();
  for (const r of rows) {
    const existing = map.get(r.profile_id);
    if (existing) existing.rows.push(r);
    else map.set(r.profile_id, { profileId: r.profile_id, fullName: r.full_name, rows: [r] });
  }
  return [...map.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** Blocked first, then whatever has carried longest — the order that matters within Pending. */
function sortForColumn(key: string, rows: DepartmentCommitmentRow[]): DepartmentCommitmentRow[] {
  if (key !== "pending") return rows;
  return [...rows].sort((a, b) => {
    if ((a.status === "blocked") !== (b.status === "blocked")) {
      return a.status === "blocked" ? -1 : 1;
    }
    return b.carry_depth - a.carry_depth;
  });
}

function Initials({ name, tone }: { name: string; tone: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold"
      style={{ background: unitWash(tone, 20), color: tone }}
    >
      {initials}
    </span>
  );
}

function CommitmentItem({ c }: { c: DepartmentCommitmentRow }) {
  return (
    <li>
      <details className="group rounded-lg border border-white/[0.08] bg-white/[0.02] open:bg-white/[0.045]">
        <summary
          className="flex min-h-11 cursor-pointer list-none items-start gap-2.5 px-3 py-2.5
                     marker:hidden [&::-webkit-details-marker]:hidden"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug text-white/90">{c.title}</p>

            {c.status === "blocked" && (
              <p className="mt-1 flex items-start gap-1 text-xs text-secondary">
                <Ban
                  size={12}
                  className="mt-0.5 shrink-0"
                  style={{ color: "var(--color-blocked)" }}
                  aria-hidden="true"
                />
                <span>
                  {blockerLabel(c.blocker_kind)}
                  {c.depends_on_department ? ` · ${c.depends_on_department}` : ""}
                </span>
              </p>
            )}

            {c.status !== "blocked" && c.carry_depth > 1 && (
              <p className="mt-1 text-2xs text-tertiary">
                Carried {c.carry_depth} weeks — usually too large for one week rather than
                neglected
              </p>
            )}

            {c.status !== "blocked" && c.deviation_declared && (
              <p className="mt-1 text-2xs text-tertiary">Flagged before the week closed</p>
            )}
          </div>

          <StatusChip status={c.status} showLabel={false} />

          <ChevronRight
            size={14}
            aria-hidden="true"
            className="mt-1 shrink-0 text-white/25 transition-transform duration-150 group-open:rotate-90"
          />
        </summary>

        <div className="space-y-2 border-t border-white/[0.07] px-3 py-2.5">
          {c.source_quote ? (
            <p className="body-sm border-l-2 border-white/[0.12] pl-2.5 italic">
              &ldquo;{c.source_quote}&rdquo;
            </p>
          ) : (
            <p className="note">No quote was captured for this commitment.</p>
          )}

          {c.description && c.description !== c.title && (
            <p className="body-sm text-secondary">{c.description}</p>
          )}

          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {c.due_on && <span className="note">Due {new Date(c.due_on).toLocaleDateString()}</span>}
            {!c.was_planned && <span className="note">Unplanned — arrived during the week</span>}
            {c.outcome_reason && <span className="note">{c.outcome_reason}</span>}
          </div>
        </div>
      </details>
    </li>
  );
}

function PersonGroup({
  profileId,
  fullName,
  rows,
  tone,
}: {
  profileId: string;
  fullName: string;
  rows: DepartmentCommitmentRow[];
  tone: string;
}) {
  return (
    <li>
      <Link
        href={`/people/${profileId}`}
        className="group/name mb-1.5 inline-flex min-h-8 items-center gap-2 rounded-md
                   hover:text-white/95"
      >
        <Initials name={fullName} tone={tone} />
        <span className="truncate text-xs font-medium text-white/70 group-hover/name:text-white/95">
          {fullName}
        </span>
        <span className="text-2xs text-tertiary">{rows.length}</span>
      </Link>
      <ul className="flex flex-col gap-1.5 pl-8">
        {rows.map((c) => (
          <CommitmentItem key={c.id} c={c} />
        ))}
      </ul>
    </li>
  );
}

function BoardColumn({
  title,
  hint,
  rows,
  departmentId,
}: {
  title: string;
  hint: string;
  rows: DepartmentCommitmentRow[];
  departmentId: string;
}) {
  const grouped = groupByPerson(rows);
  const tone = unitTone(departmentId);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h3 className="card-title">{title}</h3>
        <span className="metric text-xs text-tertiary">{rows.length}</span>
      </div>
      <p className="note -mt-2">{hint}</p>

      {grouped.length === 0 ? (
        <p className="note rounded-lg border border-dashed border-white/[0.08] px-3 py-4 text-center">
          Nothing here.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {grouped.map((g) => (
            <PersonGroup key={g.profileId} {...g} tone={tone} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function CommitmentBoard({
  department,
  cycleLabel,
  rows,
  edges,
  roster,
  weeks,
  selectedCycleId,
}: {
  department: Department;
  /** Null until a week has settled. */
  cycleLabel: string | null;
  rows: DepartmentCommitmentRow[];
  edges: BlockingEdge[];
  /** Who is in the unit, for the state before any week has closed. */
  roster?: { id: string; full_name: string; title: string | null }[];
  /** Up to the last four settled weeks, most recent first — the switcher's options. */
  weeks?: { id: string; label: string }[];
  /** Which of `weeks` is currently shown. */
  selectedCycleId?: string;
}) {
  const protectedTotal = rows.filter((r) => r.status === "blocked").length;
  const retired = rows.filter((r) => RETIRED.has(r.status));

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 pb-2">
      <div>
        <Link
          href="/departments"
          className="note inline-flex min-h-11 items-center gap-1.5 hover:text-white/80"
        >
          <ArrowLeft size={13} aria-hidden="true" /> All units
        </Link>

        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: unitTone(department.id) }}
              />
              <h1 className="truncate text-2xl font-medium tracking-tight">{department.name}</h1>
            </div>
            <p className="mt-0.5 text-xs text-tertiary">
              {department.lead_name ? `Led by ${department.lead_name} · ` : ""}
              {cycleLabel ? weekRange(cycleLabel) : "No week has closed yet"}
            </p>
          </div>

          {weeks && weeks.length > 1 && selectedCycleId && cycleLabel && (
            <WeekSwitcher deptId={department.id} weeks={weeks} selectedCycleId={selectedCycleId} />
          )}
        </div>
      </div>

      {!cycleLabel ? (
        <div className="flex flex-col gap-4">
          <GlassCard level={2} className="p-5">
            <h2 className="card-title">Nothing has been reported yet</h2>
            <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-secondary">
              The board fills in once this unit&rsquo;s first reporting week closes. The people in
              it are a fact already, and are listed below.
            </p>
          </GlassCard>

          <GlassCard level={2} className="p-5">
            <h2 className="card-title">
              In this unit <span className="metric text-secondary">{roster?.length ?? 0}</span>
            </h2>
            {roster && roster.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {roster.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-baseline justify-between gap-3 rounded-xl
                               border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5"
                  >
                    <span className="text-sm text-white/90">{p.full_name}</span>
                    {p.title && <span className="shrink-0 text-xs text-tertiary">{p.title}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-sm leading-relaxed text-secondary">
                Nobody is in it yet. Add people under People in Administration.
              </p>
            )}
          </GlassCard>
        </div>
      ) : (
        <>
          {edges.length > 0 && (
            <GlassCard level={1} className="p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                {edges.map((e, i) => (
                  <p key={i} className="text-xs text-white/80">
                    <span className="metric">{e.blocked_count}</span>{" "}
                    {e.blocked_count === 1 ? "item" : "items"} held by{" "}
                    <span style={{ color: e.to_color }}>{e.to_name}</span>
                  </p>
                ))}
              </div>
            </GlassCard>
          )}

          <GlassCard level={2} className="p-4 md:p-5">
            {rows.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="No commitments this week"
                body="Nobody in this unit had a commitment against this cycle."
              />
            ) : (
              <div className="grid gap-6 lg:grid-cols-3 lg:gap-5">
                {COLUMNS.map((col) => (
                  <BoardColumn
                    key={col.key}
                    title={col.title}
                    hint={col.hint}
                    rows={sortForColumn(
                      col.key,
                      rows.filter((r) => col.statuses.has(r.status)),
                    )}
                    departmentId={department.id}
                  />
                ))}
              </div>
            )}
          </GlassCard>

          {retired.length > 0 && (
            <details className="group">
              <summary className="note inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 marker:hidden [&::-webkit-details-marker]:hidden hover:text-white/80">
                <ChevronRight
                  size={12}
                  aria-hidden="true"
                  className="transition-transform duration-150 group-open:rotate-90"
                />
                Show dropped and superseded ({retired.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-1.5 pl-5">
                {retired.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-lg border
                               border-white/[0.06] bg-white/[0.015] px-3 py-2"
                  >
                    <span className="truncate text-xs text-white/60">{c.title}</span>
                    <StatusChip status={c.status} />
                  </li>
                ))}
              </ul>
            </details>
          )}

          {protectedTotal > 0 && (
            <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-tertiary">
              <ShieldCheck
                size={14}
                className="mt-px shrink-0 text-[var(--color-healthy)]"
                aria-hidden="true"
              />
              <span>
                {protectedTotal} {protectedTotal === 1 ? "commitment is" : "commitments are"}{" "}
                blocked by another team and excluded from this unit&rsquo;s delivery figures. Work
                held up elsewhere is not counted against the people waiting on it.
              </span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
