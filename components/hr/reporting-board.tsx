"use client";

import { m } from "motion/react";
import { Check, CircleDashed, Clock, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHead } from "@/components/executive/page-head";
import { weekLabel } from "@/lib/cycle";
import type { ComplianceRow } from "@/lib/team";
import { unitTone, unitWash } from "@/lib/unit-tone";

/*
 * Reporting — HR's view. PRD F18: who submitted, who was late, who did not.
 *
 * STRUCTURED BY WHAT HR DOES, NOT BY WHAT THE TABLE HOLDS.
 *
 * This was a flat list of everybody, one row each, sorted. Sixteen rows of
 * "On time · 5d ago · 155 chars" to find the two names that need a message —
 * the page made you do the filtering it exists to do. The people who reported
 * are not a to-do list; they are a receipt.
 *
 * So the page splits three ways by what it asks of the reader: chase these,
 * note these, and everybody else as a single line of names. The two people who
 * have not reported are the whole point, and they are now the first thing on
 * the screen at any size.
 *
 * WHAT THIS PAGE DELIBERATELY CANNOT SHOW
 *
 * It reads the submission ENVELOPE — that a check-in arrived, when, and how
 * long it was — and never `raw_text`. HR's job is compliance, and compliance
 * needs to know somebody reported, not what they said. Length is shown because
 * a two-character submission is a compliance fact; content is not, because
 * reading everyone's week is not a compliance need and a tool that quietly
 * allows it is one people write less honestly into.
 */

function ago(iso: string | null): string | null {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function ReportingBoard({
  cycleLabel,
  rows,
}: {
  cycleLabel: string;
  rows: ComplianceRow[];
}) {
  const submitted = rows.filter((r) => r.submitted);
  const late = submitted.filter((r) => r.late);
  const onTime = submitted.filter((r) => !r.late);
  const missing = rows.filter((r) => !r.submitted);
  const rate = rows.length ? Math.round((submitted.length / rows.length) * 100) : null;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 pb-2">
      <PageHead
        title="Reporting"
        cycleLabel={weekLabel(cycleLabel)}
        standfirst={
          rows.length === 0 ? (
            "Nobody is expected to report this week."
          ) : missing.length === 0 ? (
            <>
              All {rows.length} reported
              {late.length > 0 ? `, ${late.length} after the deadline.` : " on time."}
            </>
          ) : (
            <>
              {missing.length} of {rows.length}{" "}
              {rows.length === 1 ? "person has" : "people have"} not reported
              {late.length > 0 ? `, and ${late.length} filed late.` : "."}
            </>
          )
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
        <GlassCard level={2} className="p-5">
          {/*
            A figure, not a donut.

            The ring here drew one percentage as an arc, directly beside the
            three counts that produce it — the same fact told twice, once in a
            form you cannot read precisely. The number is the number.
          */}
          <p className="eyebrow">Reported</p>
          <p
            className="metric mt-1 text-3xl leading-none"
            style={{
              color:
                rate === null
                  ? "var(--color-neutral)"
                  : rate === 100
                    ? "var(--color-delivered)"
                    : rate >= 80
                      ? "var(--color-partial)"
                      : "var(--color-blocked)",
            }}
          >
            {rate === null ? "—" : `${rate}%`}
          </p>

          <div className="mt-4">
            <Stat label="On time" value={onTime.length} tone="var(--color-delivered)" />
            <Stat label="Late" value={late.length} tone="var(--color-partial)" />
            <Stat label="Not reported" value={missing.length} tone="var(--color-blocked)" />
          </div>
        </GlassCard>

        {/* ---- the only part that asks anything of the reader ------------- */}
        <GlassCard level={2} className="p-5">
          <div className="flex items-center gap-2.5">
            <CircleDashed
              size={16}
              style={{ color: missing.length ? "var(--color-blocked)" : "var(--color-healthy)" }}
              aria-hidden="true"
            />
            <h2 className="eyebrow">
              Not reported
            </h2>
          </div>

          {missing.length === 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-secondary">
              Nobody to chase. Everyone expected to report for {weekLabel(cycleLabel)} has
              done so.
            </p>
          ) : (
            <>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {missing.map((r, i) => (
                  <m.li
                    key={r.profile_id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: Math.min(i, 8) * 0.03 }}
                  >
                    <div
                      className="flex items-center gap-2.5 rounded-lg border
                                 border-[var(--color-blocked)]/20
                                 bg-[var(--color-blocked)]/[0.06] px-3 py-2.5"
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-8 shrink-0 place-items-center rounded-full
                                   text-2xs font-semibold"
                        style={{
                          background: unitWash(r.department_name),
                          color: unitTone(r.department_name),
                        }}
                      >
                        {initials(r.full_name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white/90">{r.full_name}</p>
                        <p className="truncate text-2xs text-tertiary">
                          {r.department_name ?? "Unassigned"}
                        </p>
                      </div>
                    </div>
                  </m.li>
                ))}
              </ul>

              <p className="mt-3 flex items-start gap-1.5 text-2xs leading-snug text-white/30">
                <Clock size={12} className="mt-px shrink-0" aria-hidden="true" />
                Reminders have already gone out automatically. These are the ones a
                person needs to follow up.
              </p>
            </>
          )}
        </GlassCard>
      </div>

      {/* ---- worth noting, but nothing to do ---------------------------- */}
      {late.length > 0 && (
        <GlassCard level={2} className="p-5">
          <div className="flex items-center gap-2.5">
            <Clock size={16} className="text-[var(--color-partial)]" aria-hidden="true" />
            <h2 className="eyebrow">
              Filed late
            </h2>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {late.map((r) => (
              <li
                key={r.profile_id}
                className="inline-flex items-center gap-2 rounded-full border
                           border-[var(--color-partial)]/25 bg-[var(--color-partial)]/[0.07]
                           py-1.5 pl-1.5 pr-3"
              >
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-full text-2xs font-semibold"
                  style={{
                    background: unitWash(r.department_name),
                    color: unitTone(r.department_name),
                  }}
                >
                  {initials(r.full_name)}
                </span>
                <span className="text-sm text-white/85">{r.full_name}</span>
                <span className="metric text-2xs text-white/30">
                  {ago(r.responded_at) ?? "—"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-2xs leading-snug text-white/30">
            Late is still reported. Worth knowing, not worth chasing.
          </p>
        </GlassCard>
      )}

      {/* ---- the receipt ------------------------------------------------ */}
      {onTime.length > 0 && (
        <GlassCard level={2} className="p-5">
          <div className="flex items-center gap-2.5">
            <Check size={16} className="text-[var(--color-delivered)]" aria-hidden="true" />
            <h2 className="eyebrow">
              Reported on time
            </h2>
            <span className="metric text-xs text-white/30">{onTime.length}</span>
          </div>

          {/*
            Names, not rows.

            These people need nothing from HR — they are here so the page is a
            complete record, not so anybody reads them one at a time. Fourteen
            full rows of timestamps to say "these are fine" is the noise that
            hid the two names above.
          */}
          {/*
            Names, set as text.

            These fifteen were rendered as fifteen coloured pills with avatar
            circles — the heaviest thing on a page whose entire job is to point
            at the one person who has NOT reported. They need nothing from HR;
            they are a receipt, and a receipt is a sentence.
          */}
          <p className="mt-2.5 text-sm leading-relaxed text-secondary">
            {onTime.map((r) => r.full_name).join(", ")}.
          </p>
        </GlassCard>
      )}

      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-tertiary">
        <ShieldCheck
          size={14}
          className="mt-px shrink-0 text-[var(--color-healthy)]"
          aria-hidden="true"
        />
        <span>
          This page shows whether a check-in arrived and when — never what it said.
          Compliance needs to know people reported; it does not need to read their week.
        </span>
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] py-1.5 last:border-b-0">
      <span className="text-xs text-tertiary">{label}</span>
      <span className="metric text-base" style={{ color: tone }}>
        {value}
      </span>
    </div>
  );
}
