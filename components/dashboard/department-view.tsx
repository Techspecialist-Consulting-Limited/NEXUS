"use client";

import Link from "next/link";
import { m } from "motion/react";
import {
  ArrowLeft,
  Ban,
  EarOff,
  Repeat,
  ShieldCheck,
  Users,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/motion/reveal";
import { heroItem, staggerContainer, staggerItem } from "@/lib/motion-tokens";
import { weekRange } from "@/lib/cycle";
import type {
  BlockingEdge,
  CriticalItem,
  Department,
  DepartmentHealth,
  TeamMember,
  PersonWeek,
} from "@/lib/queries";
import { unitTone, unitWash } from "@/lib/unit-tone";

/*
 * GUIDE §12 Department Drill-Down.
 *
 * "Support, not policing" is the whole framing of the manager view, so the
 * roster leads with who needs help rather than who scored highest, and people
 * who filed nothing are shown as "no update" rather than 0% — a missing
 * signal is not a failure, and rendering it as a zero would quietly libel
 * someone who was on leave.
 */

export function DepartmentView({
  department,
  health,
  team,
  said,
  critical,
  edges,
  cycleLabel,
  roster,
}: {
  department: Department;
  health: DepartmentHealth | null;
  team: TeamMember[];
  /**
   * What each person reported, keyed by profile.
   *
   * Separate from `team` on purpose: `team` is reconciliation COUNTS and this
   * is CONTENT, and they come from different tables for different reasons.
   * The roster carried only the counts, which is why it read as a flagging
   * screen — a page can only be as much about reporting as its data is.
   */
  said: PersonWeek[];
  critical: CriticalItem[];
  edges: BlockingEdge[];
  /** Null until a week has settled — see the page's no-week branch. */
  cycleLabel: string | null;
  /**
   * Who is in the unit, for the state before any week has closed.
   *
   * `team` carries reconciliation counts and cannot exist without a cycle, so
   * on a young organisation this page would otherwise show a unit with nobody
   * in it. These are the same members the Chairman's dashboard counted.
   */
  roster?: { id: string; full_name: string; title: string | null }[];
}) {
  const reports = new Map(said.map((p) => [p.profileId, p]));

  return (
    <div className="pt-2">
      <Link
        href="/departments"
        className="inline-flex min-h-11 items-center gap-1.5 text-xs text-white/50 hover:text-white/90"
      >
        <ArrowLeft size={14} aria-hidden="true" /> All units
      </Link>

      <div className="mt-1 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: unitTone(department.id) }}
            />
            <h1 className="truncate text-2xl font-medium tracking-tight">
              {department.name}
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-tertiary">
            {department.lead_name ? `Led by ${department.lead_name} · ` : ""}
            {cycleLabel ? weekRange(cycleLabel) : "No week has closed yet"}
          </p>
        </div>
      </div>

      {/*
        THE STATE BEFORE THE FIRST WEEK CLOSES.

        Everything below this point is counted from a settled reconciliation
        and there is not one yet, so the bands would each render their own
        "nothing here" and the page would read as broken rather than early.
        One honest sentence and the roster is the whole truth available.
      */}
      {!cycleLabel && (
        <div className="mt-4 space-y-4">
          <GlassCard level={2} className="p-5">
            <h2 className="card-title">Nothing has been reported yet</h2>
            <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-secondary">
              Delivery, blockers and what each person said all come from a week
              that has closed. This unit&rsquo;s first one has not. Once people
              here check in and the week settles, this page fills in on its own.
            </p>
          </GlassCard>

          <GlassCard level={2} className="p-5">
            <h2 className="card-title">
              In this unit{" "}
              <span className="metric text-secondary">{roster?.length ?? 0}</span>
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
                    {p.title && (
                      <span className="shrink-0 text-xs text-tertiary">{p.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-sm leading-relaxed text-secondary">
                Nobody is in it yet. Add people under People in Administration,
                and what they report will count for this unit.
              </p>
            )}
          </GlassCard>
        </div>
      )}

      {/*
        Every band below is counted from a settled reconciliation. With no week
        there is nothing for any of them to count, so they are not rendered at
        all rather than each drawing its own empty state — six "nothing here"
        cards in a column is how a page that is merely early comes to look
        broken.
      */}
      {cycleLabel && (
      <>
      <m.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="mt-4 space-y-4"
      >
        {/* ---- unit health ---------------------------------------------- */}
        <m.div variants={heroItem}>
          <GlassCard level={2} className="p-5">
            {/*
              NO DELIVERY OR TOLD-IN-TIME SCORE HERE.
              
              Both are computed and both still drive the reconciliation engine
              — they are simply not put in front of a reader yet. Two large
              coloured percentages at the top set the frame for everything
              below them, and the frame this page needs is "what is my team
              reporting", not "how did my team score".

              What stays is how many people reported, which is a count of
              participation rather than a judgement of anyone, and it is the
              one number that answers a question this page exists to answer.
            */}
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
              <div>
                <p className="text-xs text-tertiary">Reported this week</p>
                <p className="metric mt-1 text-2xl leading-none text-white/90">
                  {health?.people_responded ?? 0}
                  <span className="text-base text-white/40">
                    /{health?.people_reporting ?? team.length}
                  </span>
                </p>
              </div>
            </div>

            {department.description && (
              <p className="mt-4 border-t border-white/[0.07] pt-3 text-xs leading-relaxed text-tertiary">
                {department.description}
              </p>
            )}
          </GlassCard>
        </m.div>

        {/* ---- who is waiting on whom ----------------------------------- */}
        {edges.length > 0 && (
          <m.div variants={staggerItem}>
            <SectionHeader
              title="Waiting on other units"
              /*
                Was "Nobody here is scored down for these." With the scores no
                longer on the page that sentence reassured the reader about a
                mechanic they cannot see. The point it was making is still
                worth making — this work is not the waiting team's fault — so
                it now says that directly.
              */
              hint="This work is held elsewhere. It is not the waiting team's to finish."
            />
            <div className="space-y-2">
              {edges.map((e, i) => (
                <GlassCard key={i} level={1} className="p-3.5">
                  <div className="flex items-center gap-2">
                    <Ban size={14} style={{ color: "var(--color-blocked)" }} aria-hidden="true" />
                    <p className="min-w-0 flex-1 text-sm text-white/90">
                      <span className="metric">{e.blocked_count}</span>{" "}
                      {e.blocked_count === 1 ? "item" : "items"} held by{" "}
                      <span style={{ color: e.to_color }}>{e.to_name}</span>
                    </p>
                  </div>
                </GlassCard>
              ))}
            </div>
          </m.div>
        )}
      </m.div>

      {/*
       * Two columns from lg up.
       *
       * At 1440 a single column left each roster row over a thousand pixels
       * wide to hold a name and a percentage. The team and the work that is
       * stuck are also the two things a lead reads together — "who needs
       * help" and "what is holding them up" — so they belong side by side.
       */}
      <div className="mt-7 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
        <div className="lg:col-span-6">
        {/* ---- the team ---------------------------------------------------- */}
        <Reveal className="">
          <SectionHeader
            title="The team's week"
            hint="What each person reported. Open anyone to read it in their own words."
          />
          {team.length === 0 ? (
            <GlassCard level={1}>
              <EmptyState
                icon={Users}
                title="Nobody assigned"
                body="This unit has no active members this week."
              />
            </GlassCard>
          ) : (
            <ul className="space-y-2">
              {team.map((p) => {
                const said = reports.get(p.profile_id);
                return (
                <li key={p.profile_id}>
                  {/*
                    The whole row opens that person. Their name is the least
                    useful part of the row to aim at, and it truncates.
                  */}
                  <Link
                    href={`/people/${p.profile_id}`}
                    aria-label={`Open ${p.full_name}'s week`}
                    className="glass-l1 block rounded-lg p-3.5 transition-colors
                               hover:bg-white/[0.06]
                               focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="grid size-9 shrink-0 place-items-center rounded-full text-2xs font-medium"
                        style={{
                          backgroundColor: unitWash(department.id, 20),
                          color: unitTone(department.id),
                        }}
                      >
                        {p.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-white/90">{p.full_name}</p>
                        <p className="truncate text-2xs text-tertiary">
                          {p.title ?? "—"}
                        </p>
                      </div>

                      {/*
                        No delivery percentage here, deliberately. A score
                        beside somebody's name on a page their colleagues read
                        is a ranking of humans, which rejected-patterns.md §9
                        rejects — and the caption that used to sit under this
                        heading ("ordered by who may need support, not by who
                        scored highest") was the page admitting the number was
                        the loudest thing on every row.
                        The counts below stay: they name a piece of WORK that
                        needs attention rather than rating the person.
                      */}
                      {!p.responded && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-2xs text-white/45">
                          <EarOff size={11} aria-hidden="true" /> no update
                        </span>
                      )}
                    </div>

                    {/*
                      What they actually said. This is the point of the page:
                      the roster used to carry nothing anybody wrote, which is
                      why it read as a flagging screen rather than a report.
                    */}
                    {said && p.responded && (
                      <div className="mt-2.5 space-y-1 pl-12">
                        {said.delivered.length > 0 && (
                          <p className="body-sm line-clamp-2">
                            <span className="text-[var(--color-delivered)]">Landed</span>{" "}
                            {said.delivered.join(" · ")}
                          </p>
                        )}
                        {said.open.length > 0 && (
                          <p className="body-sm line-clamp-2">
                            <span className="text-white/45">Still open</span>{" "}
                            {said.open.join(" · ")}
                          </p>
                        )}
                        {said.blocked.length > 0 && (
                          <p className="body-sm line-clamp-2">
                            <span className="text-[var(--color-blocked)]">Held up</span>{" "}
                            {said.blocked.map((b: { title: string }) => b.title).join(" · ")}
                          </p>
                        )}
                        {said.planned.length > 0 && (
                          <p className="note line-clamp-1">
                            Next: {said.planned.join(" · ")}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Rule 5: silence is not an empty week. */}
                    {!p.responded && (
                      <p className="note mt-2.5 pl-12">
                        No check-in was filed for this week. Nothing here says
                        what they did or did not do.
                      </p>
                    )}

                    {(p.silent_drop_count > 0 ||
                      p.protected_count > 0 ||
                      p.carryover_count > 0) && (
                      <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 pl-12 text-2xs text-tertiary">
                        {p.silent_drop_count > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <EarOff size={11} style={{ color: "var(--color-critical)" }} aria-hidden="true" />
                            <span className="metric">{p.silent_drop_count}</span> went quiet
                          </span>
                        )}
                        {p.carryover_count > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Repeat size={11} aria-hidden="true" />
                            <span className="metric">{p.carryover_count}</span> carried
                          </span>
                        )}
                        {p.protected_count > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <ShieldCheck size={11} style={{ color: "var(--color-healthy)" }} aria-hidden="true" />
                            <span className="metric">{p.protected_count}</span> held elsewhere
                          </span>
                        )}
                      </p>
                    )}
                  </Link>
                </li>
                );
              })}
            </ul>
          )}
        </Reveal>
        </div>

        <div className="mt-7 lg:col-span-6 lg:mt-0">
        {/* ---- critical path ----------------------------------------------- */}
        <Reveal className="">
          <SectionHeader
            title="Critical path"
            hint="Blocked first, then whatever has been carried longest."
          />
          {critical.length === 0 ? (
            <GlassCard level={1}>
              <EmptyState
                icon={ShieldCheck}
                title="Nothing stuck"
                body="No blocked or repeatedly-carried work in this unit this week."
              />
            </GlassCard>
          ) : (
            <ul className="space-y-2">
              {critical.map((c) => (
                <li key={c.id}>
                  <GlassCard level={1} className="p-3.5">
                    <p className="text-sm leading-snug text-white/90">{c.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusChip status={c.status} />
                      {c.carry_depth > 1 && (
                        <span className="metric rounded-md bg-white/[0.06] px-1.5 py-0.5 text-2xs text-white/60">
                          carried ×{c.carry_depth}
                        </span>
                      )}
                      {c.depends_on_department && (
                        <span
                          className="rounded-md px-1.5 py-0.5 text-2xs"
                          style={{
                            color: c.depends_on_color ?? "var(--text-secondary)",
                            backgroundColor: `color-mix(in srgb, ${c.depends_on_color ?? "#888"} 14%, transparent)`,
                          }}
                        >
                          waiting on {c.depends_on_department}
                        </span>
                      )}
                      <span className="ml-auto text-2xs text-tertiary">{c.owner}</span>
                    </div>
                  </GlassCard>
                </li>
              ))}
            </ul>
          )}
        </Reveal>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
