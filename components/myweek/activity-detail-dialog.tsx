"use client";

import { Quote, Repeat2, ShieldCheck } from "lucide-react";
import type { ActivityEntry } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/tasks/status-badge";
import { weekLabel } from "@/lib/cycle";
import { fullDate, fullDateTime } from "@/lib/when";

/*
 * The whole of one activity entry, opened from its card.
 *
 * The stream shows a title and a line. This shows what the record actually
 * holds — and ONLY what it holds. Every field below is a column in
 * `commitments` or `check_ins`; there is no progress percentage, no time
 * spent, no "last seen", because the schema has none of those and a detail
 * view is exactly where the temptation to invent one is strongest
 * (rejected-patterns.md #11).
 *
 * A row is omitted when its value is null rather than rendered as "—". A
 * dash is a label saying there is nothing to say, and a column of them turns
 * a short honest record into a long empty form.
 */

export function ActivityDetailDialog({
  entry,
  open,
  onClose,
}: {
  entry: ActivityEntry | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!entry) return null;

  return (
    <Dialog open={open} onClose={onClose} labelledBy="activity-detail-title">
      <div className="overflow-y-auto p-5 sm:p-6">
        {entry.kind === "report" ? (
          <ReportDetail entry={entry} />
        ) : (
          <CommitmentDetail entry={entry} />
        )}
      </div>
    </Dialog>
  );
}

function ReportDetail({
  entry,
}: {
  entry: Extract<ActivityEntry, { kind: "report" }>;
}) {
  const filed = fullDateTime(entry.at);
  return (
    <>
      <p className="eyebrow">Your report · {weekLabel(entry.cycle_label)}</p>
      <h2 id="activity-detail-title" className="card-title mt-2 pr-10 text-lg">
        What you filed
      </h2>
      {filed && <p className="note mt-1">Filed {filed}</p>}

      {/*
        VERBATIM, AND WHITESPACE PRESERVED.

        This is `check_ins.raw_text` — the column migration 0002 guards as
        append-only and documents as "exactly what the human wrote". It is
        quoted back to the Chairman under this person's name, so the one place
        they can read it themselves must show it unaltered, paragraph breaks
        included.
      */}
      <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--nx-text-primary)]">
          {entry.raw_text}
        </p>
      </div>

      {/*
        Saved and readable, but nothing has been read out of it yet. Said
        plainly rather than left to look like a clean result — a report whose
        extraction failed is still a filed report, and the person should know
        which of the two they are looking at.
      */}
      {entry.status === "failed" && (
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-warning)]">
          NEXUS saved this but could not read it into commitments. Your words
          are intact and nothing was lost.
        </p>
      )}
    </>
  );
}

function CommitmentDetail({
  entry: c,
}: {
  entry: Extract<ActivityEntry, { kind: "commitment" }>;
}) {
  /* Facts, each one a column. Absent values are absent rows. */
  const facts: { label: string; value: string }[] = [];
  if (c.category) facts.push({ label: "Area", value: c.category });
  if (c.depends_on_department)
    facts.push({ label: "Waiting on", value: c.depends_on_department });
  if (c.priority && c.priority !== "none" && c.priority !== "normal")
    facts.push({ label: "Priority", value: c.priority });
  if (!c.was_planned) facts.push({ label: "Planned", value: "No — unplanned" });
  if (c.estimated_effort_hours != null)
    facts.push({ label: "Estimated", value: `${c.estimated_effort_hours} hrs` });
  if (c.actual_effort_hours != null)
    facts.push({ label: "Actual", value: `${c.actual_effort_hours} hrs` });

  const dates: { label: string; value: string }[] = [];
  const created = fullDate(c.created_at);
  if (created) dates.push({ label: "Committed", value: created });
  const due = fullDate(c.due_on);
  if (due) dates.push({ label: "Due", value: due });
  const declared = fullDate(c.declared_at);
  if (declared) dates.push({ label: "Update declared", value: declared });
  const delivered = fullDate(c.delivered_at);
  if (delivered) dates.push({ label: "Delivered", value: delivered });

  return (
    <>
      <p className="eyebrow">Commitment · for {weekLabel(c.target_label)}</p>
      <h2 id="activity-detail-title" className="card-title mt-2 pr-10 text-lg">
        {c.title}
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={c.status} />
        {c.carry_depth > 1 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-partial)]">
            <Repeat2 size={13} aria-hidden="true" />
            carried {c.carry_depth}×
          </span>
        )}
      </div>

      {c.description && (
        <Section title="Description">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--nx-text-primary)]">
            {c.description}
          </p>
        </Section>
      )}

      {/*
        THE COMMENT, which is `outcome_reason`.

        The same column the status modal on Pending Tasks writes to and the
        same one a check-in's blocker note lands in. Headed "Your update"
        rather than "Outcome reason" because the person reading it wrote it,
        and they wrote it as an update.
      */}
      {c.outcome_reason && (
        <Section title="Your update">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--nx-text-primary)]">
            {c.outcome_reason}
          </p>
        </Section>
      )}

      {c.status === "blocked" && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-sm">
          <ShieldCheck
            size={16}
            className="mt-0.5 shrink-0 text-[var(--color-blocked)]"
            aria-hidden="true"
          />
          <span className="leading-relaxed text-secondary">
            {c.depends_on_department
              ? `This is waiting on ${c.depends_on_department}. Work held up elsewhere is not counted against your delivery.`
              : "This is being held up. Work you cannot move is not counted against your delivery."}
          </span>
        </p>
      )}

      {/*
        Their own sentence, from the check-in this was extracted from. It is
        the evidence for everything above it: a commitment nobody recognises
        is one they can trace back to the words that created it.
      */}
      {c.source_quote && (
        <Section title="From your check-in">
          <blockquote className="flex items-start gap-2 rounded-lg border-l-2 border-[var(--nx-primary)] bg-white/[0.03] p-3">
            <Quote
              size={14}
              className="mt-0.5 shrink-0 text-[var(--nx-text-muted)]"
              aria-hidden="true"
            />
            <p className="text-sm italic leading-relaxed text-[var(--nx-text-secondary)]">
              &ldquo;{c.source_quote}&rdquo;
            </p>
          </blockquote>
        </Section>
      )}

      {facts.length > 0 && (
        <dl className="mt-5 divide-y divide-white/[0.06] border-t border-white/[0.06]">
          {facts.map((f) => (
            <Row key={f.label} label={f.label} value={f.value} capitalize />
          ))}
        </dl>
      )}

      {dates.length > 0 && (
        <dl className="mt-5 divide-y divide-white/[0.06] border-t border-white/[0.06]">
          {dates.map((d) => (
            <Row key={d.label} label={d.label} value={d.value} />
          ))}
        </dl>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="eyebrow">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  capitalize = false,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5">
      <dt className="text-[13px] text-[var(--nx-text-muted)]">{label}</dt>
      <dd
        className={
          capitalize
            ? "text-right text-sm font-medium capitalize text-[var(--nx-text-primary)]"
            : "metric text-right text-sm text-[var(--nx-text-primary)]"
        }
      >
        {value}
      </dd>
    </div>
  );
}
