"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Quote, Repeat2, ShieldCheck } from "lucide-react";
import type { CommitmentRow } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/tasks/status-badge";
import { useToast } from "@/components/ui/toast";
import { fullDate } from "@/lib/when";
import { cn } from "@/lib/cn";

/*
 * One commitment: where it got to, and what you want to say about it.
 *
 * THIS USED TO BE READ-ONLY, AND THAT WAS THE GAP.
 *
 * Pending Tasks could open a commitment's detail and could not change it. The
 * only thing a person could do to their own work from this page was a "Done"
 * button on the row — every other transition meant going to /check-in and
 * filing a whole week to say one thing had become blocked. So the page called
 * Pending Tasks was a page you could read tasks on.
 *
 * WHY A ONE-TAP STATUS DOES NOT BYPASS THE REPORTING LOOP.
 *
 * NEXUS's premise is that status comes from what somebody reports, not from
 * ticking boxes, so a status control looks at first like a way around it. It
 * is not, because of one field: the write sends `declared: true`, and the
 * scoring in migration 0004 treats a declared change very differently from the
 * same status arriving in silence. Pressing this IS telling NEXUS what
 * happened. What it can never do is be silent.
 *
 * THE COMMENT IS THE PART THAT MATTERS ON THREE OF THE FOUR.
 *
 * A one-tap "blocked" with no explanation is exactly the silent drop this
 * product exists to surface, so the box is always here rather than being
 * revealed by a status — and it is optional rather than enforced, because a
 * required field on a status change is how you get "n/a" typed into a record
 * somebody else is going to read.
 *
 * The write goes through asActor() server-side, so RLS decides: an id
 * belonging to somebody else's week updates nothing and returns 404.
 */

/*
 * The four states somebody moves their own work between, in the product's own
 * vocabulary (ui-content.md's commitment state table).
 *
 * `promised` is shown as "Pending" because that is the word this page is named
 * for and the word a person uses about their own not-yet-started work.
 * `partial`, `deferred`, `dropped` and `superseded` are deliberately absent:
 * each is a decision that needs a reason more than it needs a button, and they
 * belong in the check-in where the reason is captured alongside the week.
 */
const CHOICES = [
  { value: "delivered", label: "Done", hint: "Finished and closed out" },
  { value: "in_progress", label: "In progress", hint: "Actively being worked on" },
  { value: "promised", label: "Pending", hint: "Committed to, not started yet" },
  { value: "blocked", label: "Blocked", hint: "Waiting on something outside my control" },
] as const;

const TONE: Record<string, string> = {
  delivered: "var(--color-delivered)",
  in_progress: "var(--color-in-progress)",
  promised: "var(--color-promised)",
  blocked: "var(--color-blocked)",
};

export function TaskUpdateDialog({
  commitment: c,
  open,
  onClose,
}: {
  commitment: CommitmentRow | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!c) return null;

  return (
    <Dialog open={open} onClose={onClose} labelledBy="task-detail-title">
      {/*
        REMOUNTED PER COMMITMENT, RATHER THAN RESET BY AN EFFECT.

        The form holds a chosen status and a half-typed comment. Both belong to
        one piece of work, and both were previously cleared in a `useEffect`
        keyed on the id — which is the cascading-render pattern React now warns
        about, and which also left one render where the buttons showed the
        PREVIOUS task's selection.

        The key is the identity the state belongs to: a different commitment,
        or the same one whose status has since changed underneath, is a
        different form. React discards the old state and initialises fresh,
        with no effect and no intermediate wrong frame.
      */}
      <UpdateBody key={`${c.id}:${c.status}`} commitment={c} onClose={onClose} />
    </Dialog>
  );
}

function UpdateBody({
  commitment: c,
  onClose,
}: {
  commitment: CommitmentRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [refreshing, startRefresh] = useTransition();

  const [status, setStatus] = useState<string>(c.status);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const changed = status !== c.status || comment.trim().length > 0;
  const busy = saving || refreshing;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/commitments/${c.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          declared: true,
          /*
           * Only when there is something to say. The route coalesces a null
           * reason onto the existing value, so sending an empty string would
           * overwrite a real explanation with nothing.
           */
          reason: comment.trim() || undefined,
        }),
      });

      if (!res.ok) {
        toast({
          variant: "error",
          title: "That could not be saved",
          description:
            res.status === 404
              ? "This is no longer yours to change."
              : "Nothing was saved. Your comment is still here — try again.",
        });
        return;
      }

      toast({
        variant: "success",
        title: "Update saved",
        /*
          Says what was recorded, not just that it worked. "NEXUS has it as
          declared" is the part that matters — it is what keeps this out of the
          silent-drop count when the week reconciles.
        */
        description: `“${c.title}” is ${labelFor(status).toLowerCase()}, and NEXUS has it as declared.`,
      });
      startRefresh(() => {
        router.refresh();
        onClose();
      });
    } catch {
      toast({
        variant: "error",
        title: "NEXUS could not be reached",
        description: "Nothing was saved. Your comment is still here.",
      });
    } finally {
      setSaving(false);
    }
  }

  /* Facts, each one a column. An absent value is an absent row, never a dash. */
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
  for (const [label, raw] of [
    ["Committed", c.created_at],
    ["Due", c.due_on],
    ["Update declared", c.declared_at],
    ["Delivered", c.delivered_at],
  ] as const) {
    const v = fullDate(raw);
    if (v) dates.push({ label, value: v });
  }

  return (
    <div className="overflow-y-auto p-5 sm:p-6">
        <p className="eyebrow">
          {c.status === "blocked" ? "Commitment · blocked" : "Commitment"}
        </p>
        <h2 id="task-detail-title" className="card-title mt-2 pr-10 text-lg">
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
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[var(--nx-text-secondary)]">
            {c.description}
          </p>
        )}

        {/* ---- The update ------------------------------------------- */}
        <div className="mt-5 rounded-xl border border-white/[0.09] bg-white/[0.03] p-4">
          <fieldset>
            <legend className="eyebrow">Status</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CHOICES.map((choice) => {
                const active = status === choice.value;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => setStatus(choice.value)}
                    aria-pressed={active}
                    title={choice.hint}
                    className={cn(
                      "nx-focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-[13px] transition-colors",
                      active
                        ? "border-transparent bg-white/[0.10] font-medium text-[var(--nx-text-primary)]"
                        : "border-white/[0.10] text-[var(--nx-text-secondary)] hover:bg-white/[0.06]",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ background: TONE[choice.value] }}
                    />
                    {choice.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label
            htmlFor="task-comment"
            className="eyebrow mt-4 block"
          >
            Comment
          </label>
          <textarea
            id="task-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder={
              status === "blocked"
                ? "What is holding it up, and who could clear it?"
                : "Add an update, or explain what is happening."
            }
            className="mt-1.5 w-full resize-y rounded-lg border border-white/[0.14] bg-white/[0.05]
                       px-3 py-2 text-[13px] leading-relaxed text-[var(--nx-text-primary)]
                       placeholder:text-[var(--nx-text-muted)]
                       focus:border-[var(--nx-primary)]/70 focus:outline-none"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="note max-w-[38ch]">
              Telling NEXUS early counts in your favour.
            </p>
            <button
              type="button"
              onClick={() => void save()}
              /*
                Disabled only when there is genuinely nothing to record — the
                same status and no comment. A save button that is live when
                pressing it would change nothing is a button that reports
                success for doing nothing.
              */
              disabled={busy || !changed}
              className="nx-focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg
                         bg-[var(--nx-primary)] px-4 text-sm font-medium text-[var(--on-accent)]
                         transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Check size={14} aria-hidden="true" />
              )}
              {busy ? "Saving…" : "Save update"}
            </button>
          </div>
        </div>

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
          The last thing recorded about this, which is what a new comment adds
          to. Shown so somebody is not writing over context they cannot see.
        */}
        {c.outcome_reason && (
          <div className="mt-5">
            <h3 className="eyebrow">Last update</h3>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--nx-text-secondary)]">
              {c.outcome_reason}
            </p>
          </div>
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

        {c.source_quote && (
          <blockquote className="mt-5 flex items-start gap-2 rounded-lg border-l-2 border-[var(--nx-primary)] bg-white/[0.03] p-3">
            <Quote
              size={14}
              className="mt-0.5 shrink-0 text-[var(--nx-text-muted)]"
              aria-hidden="true"
            />
            <p className="text-sm italic leading-relaxed text-[var(--nx-text-secondary)]">
              &ldquo;{c.source_quote}&rdquo;
            </p>
          </blockquote>
      )}
    </div>
  );
}

function labelFor(status: string): string {
  return CHOICES.find((c) => c.value === status)?.label ?? status;
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
