"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import {
  DAY_NAME,
  INTERVAL_CHOICES,
  REVIEW_WINDOW_CHOICES,
  clockLabel,
  durationLabel,
  nextCadenceMoment,
  type DigestCadence,
  type RhythmConfig,
} from "@/lib/rhythm-vocabulary";

/*
 * The reporting rhythm — and every control on it does something.
 *
 * This page used to describe the rhythm and offer nothing, because NEXUS did
 * not decide its own timing: something outside it called the tick endpoint and
 * every job ran. A time picker then would have stored a preference nothing
 * read, which is worse than no picker at all.
 *
 * `lib/rhythm.ts` now gates each job on these values, per organisation, in the
 * organisation's own timezone. The scheduler ticks; the gate decides when.
 *
 * TWO BLOCKS, BECAUSE THERE ARE TWO DECISIONS.
 *
 * When people are asked for their week is a decision about the organisation's
 * working week, and it changes roughly never. When the Chairman is briefed is a
 * decision about him, and during a pilot it can change twice in an afternoon.
 * They were one undifferentiated list of six selects, which made the second one
 * look as heavy as the first.
 */

type Kind = DigestCadence["kind"];

const KIND_LABEL: Record<Kind, string> = {
  weekly: "Every week",
  daily: "Every day",
  interval: "Every few minutes",
  manual: "Only when I ask",
};

/**
 * Switch cadence without losing what was already chosen.
 *
 * Somebody trying "every day" to see what it looks like, then going back to
 * "every week", should find their Tuesday still there. Re-deriving a default
 * each time makes the picker feel like it is arguing with them.
 */
function switchKind(current: DigestCadence, kind: Kind): DigestCadence {
  const hour = "hour" in current ? current.hour : 9;
  const minute = "minute" in current ? current.minute : 0;
  const day = current.kind === "weekly" ? current.day : 1;

  switch (kind) {
    case "weekly": return { kind: "weekly", day, hour, minute };
    case "daily": return { kind: "daily", hour, minute };
    case "interval": return { kind: "interval", minutes: 30 };
    case "manual": return { kind: "manual" };
  }
}

export function RhythmForm({
  rhythm,
  timezone,
  now,
}: {
  rhythm: RhythmConfig;
  timezone: string;
  /*
   * The server's clock, as an ISO string. Passed in rather than read here so
   * "next brief: Monday 31 Aug, 09:00" renders identically on the server and on
   * first paint. Reading the clock during render is the classic hydration
   * mismatch, and this line is the one thing on the page somebody will check.
   */
  now: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [form, setForm] = useState<RhythmConfig>(rhythm);
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(rhythm);
  const set = <K extends keyof RhythmConfig>(key: K, value: RhythmConfig[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  /*
   * The one relationship worth checking, and it is a position in the WEEK
   * rather than a clock time.
   *
   * A chase before the opening is a chase about a week nobody has been asked
   * about. With the day fixed to the prompt's that could only mean "earlier
   * the same day"; now that the day is configurable it also means an earlier
   * weekday — and `currentCycles` resolves the week containing today, so a
   * Monday chase after a Friday opening runs against the FOLLOWING week and
   * would chase everybody about work they have not been prompted for.
   */
  const opensAt = form.promptDay * 1440 + form.promptHour * 60 + form.promptMinute;
  const chasesAt =
    form.reminderDay * 1440 + form.reminderHour * 60 + form.reminderMinute;
  const reminderTooEarly = chasesAt <= opensAt;

  const cadence = form.digestCadence;
  const upcoming = nextCadenceMoment(cadence, timezone, new Date(now));

  async function save() {
    if (reminderTooEarly) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/reporting", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Could not save (${res.status})`);
      toast({
        variant: "success",
        title: "Rhythm updated",
        description: "It takes effect from the next scheduled run.",
      });
      router.refresh();
    } catch (e) {
      toast({
        variant: "error",
        title: "Could not save that",
        description:
          e instanceof Error
            ? e.message
            : "NEXUS could not be reached. Your changes are still here — try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------------------------------------------------------- */}
      {/* The working week                                                  */}
      {/* ---------------------------------------------------------------- */}
      <section className="rounded-lg border border-white/[0.09] bg-white/[0.02]">
        <div className="border-b border-white/[0.07] px-4 py-3.5">
          <h2 className="text-base font-medium text-white/90">The working week</h2>
          <p className="note mt-1">
            All times are read in {timezone}. Change that on the Organization page.
          </p>
        </div>

        <div className="flex flex-col divide-y divide-white/[0.05]">
          <Row
            label="The week opens"
            hint="NEXUS opens a check-in for everybody who reports, and tells them."
          >
            <Select
              aria="Day the week opens"
              value={form.promptDay}
              onChange={(v) => set("promptDay", v)}
              options={Object.entries(DAY_NAME).map(([v, l]) => [Number(v), l])}
            />
            <Clock
              label="the week opens"
              hour={form.promptHour}
              minute={form.promptMinute}
              onHour={(v) => set("promptHour", v)}
              onMinute={(v) => set("promptMinute", v)}
            />
          </Row>

          <Row
            label="NEXUS chases"
            hint="Only people who have not answered. Anybody who reported hears nothing further."
          >
            <Select
              aria="Day NEXUS chases"
              value={form.reminderDay}
              onChange={(v) => set("reminderDay", v)}
              options={Object.entries(DAY_NAME).map(([v, l]) => [Number(v), l])}
            />
            <Clock
              label="NEXUS chases"
              hour={form.reminderHour}
              minute={form.reminderMinute}
              onHour={(v) => set("reminderHour", v)}
              onMinute={(v) => set("reminderMinute", v)}
              invalid={reminderTooEarly}
            />
          </Row>

          {reminderTooEarly && (
            <p className="px-4 py-2.5 text-xs text-[var(--color-warning)]">
              A chase before the opening would never fire — there is nothing to
              chase yet, and on an earlier weekday it would run against the
              following week instead. Set it after{" "}
              {DAY_NAME[form.promptDay]}{" "}
              {clockLabel(form.promptHour, form.promptMinute)}, and no later
              than Sunday.
            </p>
          )}

          <Row
            label="Reporting starts"
            hint="The first week NEXUS reconciles. Leave it empty to start from the day this organisation was created. A week somebody actually reported in is always counted, whatever this says."
          >
            <input
              type="date"
              aria-label="First week to report on"
              value={form.reportingStartsOn ?? ""}
              onChange={(e) => set("reportingStartsOn", e.target.value || null)}
              className="min-h-11 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3
                         text-sm text-white/90 [color-scheme:dark]
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
            />
          </Row>

          <Row
            label="Daily message budget"
            hint="The most NEXUS will send one person in a day, across every kind. A genuine escalation is exempt."
          >
            <Select
              aria="Daily message budget"
              value={form.maxNudgesPerDay}
              onChange={(v) => set("maxNudgesPerDay", v)}
              options={[1, 2, 3, 4, 5].map((n) => [n, `${n} a day`])}
            />
          </Row>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* The Chairman's brief                                              */}
      {/* ---------------------------------------------------------------- */}
      <section className="rounded-lg border border-white/[0.09] bg-white/[0.02]">
        <div className="border-b border-white/[0.07] px-4 py-3.5">
          <h2 className="text-base font-medium text-white/90">The Chairman&rsquo;s brief</h2>
          <p className="note mt-1">
            Generated from figures counted in SQL, then emailed and shown on his
            dashboard.
          </p>
        </div>

        <div className="flex flex-col divide-y divide-white/[0.05]">
          <Row
            label="Send it"
            hint="How often the brief goes out. Anything down to five minutes — that is how often the scheduler checks."
          >
            <Select
              aria="How often the brief is sent"
              value={cadence.kind}
              onChange={(v) => set("digestCadence", switchKind(cadence, v as Kind))}
              options={(Object.keys(KIND_LABEL) as Kind[]).map((k) => [k, KIND_LABEL[k]])}
            />

            {cadence.kind === "weekly" && (
              <Select
                aria="Day the brief is sent"
                value={cadence.day}
                onChange={(v) => set("digestCadence", { ...cadence, day: v })}
                options={Object.entries(DAY_NAME).map(([v, l]) => [Number(v), l])}
              />
            )}

            {(cadence.kind === "weekly" || cadence.kind === "daily") && (
              <Clock
                label="the brief is sent"
                hour={cadence.hour}
                minute={cadence.minute}
                onHour={(v) => set("digestCadence", { ...cadence, hour: v })}
                onMinute={(v) => set("digestCadence", { ...cadence, minute: v })}
              />
            )}

            {cadence.kind === "interval" && (
              <Select
                aria="How often the brief is sent"
                value={cadence.minutes}
                onChange={(v) => set("digestCadence", { kind: "interval", minutes: v })}
                options={INTERVAL_CHOICES.map((m) => [m, durationLabel(m)])}
              />
            )}
          </Row>

          <Row
            label="Brief on"
            hint="A week in progress has work still coming, so briefing on it reports half a week as though it were whole. Choose it anyway when you need a picture today rather than on Monday."
          >
            <Select
              aria="Which week the brief covers"
              value={form.briefCurrentCycle ? 1 : 0}
              onChange={(v) => set("briefCurrentCycle", v === 1)}
              options={[
                [0, "The week that has ended"],
                [1, "The week in progress"],
              ]}
            />
          </Row>

          <Row
            label="Correction window"
            hint="How long somebody has to review their own week before it reaches their lead and the Chairman. This is the promise that makes people write the truth — shorten it deliberately, not by accident."
          >
            <Select
              aria="Correction window"
              value={form.reviewWindowMinutes}
              onChange={(v) => set("reviewWindowMinutes", v)}
              options={REVIEW_WINDOW_CHOICES.map((m) => [m, durationLabel(m)])}
            />
          </Row>
        </div>

        {/*
          What the settings above actually produce, as a date. An administrator
          who has just chosen "every Tuesday at 07:30" should be able to read
          back the day that lands on rather than work it out and hope.
        */}
        <div className="border-t border-white/[0.07] px-4 py-3">
          {cadence.kind === "manual" ? (
            <p className="note">
              Nothing goes out on a schedule. Use <strong>Send it now</strong> below.
            </p>
          ) : (
            <p className="note">
              {dirty ? "Once saved, the next" : "Next"} brief:{" "}
              <span className="text-white/75">
                {cadence.kind === "interval"
                  ? `within ${durationLabel(cadence.minutes)} of the last one`
                  : upcoming
                    ? formatMoment(upcoming, timezone)
                    : "—"}
              </span>
              {form.briefCurrentCycle && (
                <>
                  {" · covering the week in progress, "}
                  {durationLabel(form.reviewWindowMinutes)} after each person reports
                </>
              )}
            </p>
          )}
        </div>
      </section>

      <div
        className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.09]
                   bg-white/[0.02] px-4 py-3"
      >
        <p className="note">{dirty ? "Unsaved changes." : "Everything is saved."}</p>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving || reminderTooEarly}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--dept-techspecialist)]
                     px-4 text-sm font-medium text-white transition-opacity
                     hover:opacity-90 disabled:opacity-30"
        >
          {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

/** "Mon 31 Aug, 09:00", in the organisation's timezone rather than the reader's. */
function formatMoment(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

const HOURS = (): [number, string][] =>
  Array.from({ length: 24 }, (_, h) => [h, String(h).padStart(2, "0")]);

/** Five-minute steps. Finer than that is precision the scheduler cannot honour. */
const MINUTES = (): [number, string][] =>
  Array.from({ length: 12 }, (_, i) => [i * 5, String(i * 5).padStart(2, "0")]);

function Clock({
  label,
  hour,
  minute,
  onHour,
  onMinute,
  invalid,
}: {
  label: string;
  hour: number;
  minute: number;
  onHour: (v: number) => void;
  onMinute: (v: number) => void;
  invalid?: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      <Select
        aria={`Hour ${label}`}
        value={hour}
        onChange={onHour}
        options={HOURS()}
        invalid={invalid}
      />
      <span aria-hidden="true" className="text-xs text-tertiary">
        :
      </span>
      <Select
        aria={`Minute ${label}`}
        value={minute}
        /*
         * A stored value off the five-minute grid — from an older setting, or
         * another administrator — must still be selectable, or opening this
         * page would silently round somebody's schedule.
         */
        options={
          MINUTES().some(([m]) => m === minute)
            ? MINUTES()
            : [...MINUTES(), [minute, String(minute).padStart(2, "0")] as [number, string]].sort(
                (a, b) => a[0] - b[0],
              )
        }
        onChange={onMinute}
        invalid={invalid}
      />
    </span>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5 px-4 py-3.5">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm text-white/90">{label}</p>
        <p className="note mt-0.5 max-w-sm">{hint}</p>
      </div>
      {/*
        min-w-0 rather than shrink-0. The brief's cadence row carries four
        controls — how often, which day, the hour and the minute — and at 360px
        they are wider than the viewport. shrink-0 meant the row could not give
        way, so the page scrolled sideways instead of wrapping.
      */}
      <div className="flex min-w-0 flex-wrap justify-end gap-2">{children}</div>
    </div>
  );
}

function Select<T extends string | number>({
  aria,
  value,
  onChange,
  options,
  invalid,
}: {
  aria: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
  invalid?: boolean;
}) {
  return (
    <select
      aria-label={aria}
      aria-invalid={invalid || undefined}
      value={value}
      onChange={(e) =>
        onChange(
          (typeof value === "number" ? Number(e.target.value) : e.target.value) as T,
        )
      }
      className={
        "min-h-11 rounded-lg border bg-white/[0.03] px-2.5 text-xs text-white/85 " +
        "focus:outline-none " +
        (invalid
          ? "border-[var(--color-warning)]/60"
          : "border-white/[0.10] focus:border-white/25")
      }
    >
      {options.map(([v, l]) => (
        <option key={String(v)} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
