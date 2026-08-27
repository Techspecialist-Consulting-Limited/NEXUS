"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Clock3, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { durationLabel } from "@/lib/rhythm-vocabulary";

/*
 * Ask for the Chairman's brief, outside the rhythm.
 *
 * WHY THIS IS NOT PART OF THE FORM ABOVE IT.
 *
 * Everything in the rhythm form is a standing decision that takes effect on the
 * next run. This is a request that happens now, and it must not be reachable by
 * accident from a Save button somebody pressed for another reason. Different
 * act, different endpoint, different control.
 *
 * The only previous way to trigger a brief was an authenticated POST to
 * /api/cron/tick?job=digest carrying the CRON_SECRET — a thing an administrator
 * does not have and should not be given. In practice that meant "when is the
 * Chairman briefed?" had exactly one answer: next Monday.
 */

/** The delays worth offering. Anything longer is a cadence, not an errand. */
const SOON = [5, 10, 15, 30, 60, 120];

export function BriefDelivery({
  scheduledFor,
  timezone,
}: {
  /** A one-off already queued, as an ISO instant. */
  scheduledFor: string | null;
  timezone: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [busy, setBusy] = useState<null | "now" | "queue" | "cancel">(null);
  const [inMinutes, setInMinutes] = useState(10);
  /*
   * What the last run actually did, kept on the page rather than only in a
   * toast. "There is no settled week to brief on" is a sentence somebody needs
   * to read twice and act on, and a toast that has faded is no help at all.
   */
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  async function ask(payload: Record<string, unknown>, mode: "now" | "queue" | "cancel") {
    setBusy(mode);
    setOutcome(null);
    try {
      const res = await fetch("/api/admin/reporting/deliver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `That did not work (${res.status})`);

      if (mode === "now") {
        /*
         * Report what happened, not that the request succeeded. The request
         * almost always succeeds; the interesting question is whether a brief
         * was actually written, and the commonest answer is "no, because no
         * week has settled" — which is a setting away from working.
         */
        const wrote = Number(data.wrote ?? 0);
        const sent = Number(data.sent ?? 0);
        setOutcome({
          ok: wrote > 0,
          text: wrote === 0
            ? `No brief was written. ${data.detail ?? ""}`.trim()
            : sent > 0
              ? `Brief written and delivered to ${sent} ${sent === 1 ? "recipient" : "recipients"}. It is on the Chairman's dashboard now.`
              : `Brief written and on the Chairman's dashboard. It was not emailed — ${data.detail ?? "the mail transport declined it"}.`,
        });
        toast({
          variant: wrote > 0 ? "success" : "error",
          title: wrote > 0 ? "Brief sent" : "Nothing to brief on",
          description: wrote > 0 ? "The Chairman can see it now." : String(data.detail ?? ""),
        });
      } else {
        toast({
          variant: "success",
          title: mode === "cancel" ? "Queued brief cancelled" : "Brief queued",
          description:
            mode === "cancel"
              ? "Nothing extra will go out."
              : `NEXUS will send it in ${durationLabel(inMinutes)}.`,
        });
      }
      router.refresh();
    } catch (e) {
      const text = e instanceof Error ? e.message : "NEXUS could not be reached.";
      setOutcome({ ok: false, text });
      toast({ variant: "error", title: "Could not do that", description: text });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border border-white/[0.09] bg-white/[0.02]">
      <div className="border-b border-white/[0.07] px-4 py-3.5">
        <h2 className="text-base font-medium text-white/90">Send a brief outside the rhythm</h2>
        <p className="note mt-1">
          Reconciles this organisation, writes the brief and delivers it. Nothing
          about the schedule above changes.
        </p>
      </div>

      {scheduledFor && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07]
                     bg-white/[0.02] px-4 py-3"
        >
          <p className="body-sm">
            <Clock3 size={13} className="mr-1.5 inline align-[-1px] text-tertiary" aria-hidden="true" />
            A brief is queued for{" "}
            <span className="text-white/85">{formatMoment(scheduledFor, timezone)}</span>.
          </p>
          <button
            type="button"
            onClick={() => void ask({ action: "cancel" }, "cancel")}
            disabled={busy !== null}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/[0.12]
                       px-3 text-xs text-white/70 hover:text-white/90 disabled:opacity-40"
          >
            {busy === "cancel" ? (
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            ) : (
              <X size={12} aria-hidden="true" />
            )}
            Cancel it
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3.5">
        <button
          type="button"
          onClick={() => void ask({ action: "now" }, "now")}
          disabled={busy !== null}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--dept-techspecialist)]
                     px-4 text-sm font-medium text-white transition-opacity
                     hover:opacity-90 disabled:opacity-30"
        >
          {busy === "now" ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Send size={14} aria-hidden="true" />
          )}
          {busy === "now" ? "Working…" : "Send it now"}
        </button>

        <span className="note">or</span>

        <span className="flex items-center gap-2">
          <label htmlFor="brief-in" className="body-sm text-white/70">
            in
          </label>
          <select
            id="brief-in"
            value={inMinutes}
            onChange={(e) => setInMinutes(Number(e.target.value))}
            className="min-h-11 rounded-lg border border-white/[0.10] bg-white/[0.03] px-2.5
                       text-xs text-white/85 focus:border-white/25 focus:outline-none"
          >
            {SOON.map((m) => (
              <option key={m} value={m}>
                {durationLabel(m)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void ask({ action: "schedule", inMinutes }, "queue")}
            disabled={busy !== null}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/[0.14]
                       px-3.5 text-sm text-white/85 hover:border-white/25 disabled:opacity-30"
          >
            {busy === "queue" && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
            Queue it
          </button>
        </span>
      </div>

      {outcome && (
        <p
          className={
            "border-t border-white/[0.07] px-4 py-3 text-xs " +
            (outcome.ok ? "text-white/70" : "text-[var(--color-warning)]")
          }
        >
          {outcome.text}
        </p>
      )}
    </section>
  );
}

/** "Thu 27 Aug, 17:45", in the organisation's timezone rather than the reader's. */
function formatMoment(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
