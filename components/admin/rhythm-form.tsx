"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { hourLabel } from "@/lib/settings-vocabulary";
import { DAY_NAME, type RhythmConfig } from "@/lib/rhythm-vocabulary";

/*
 * The reporting rhythm — and every control on it does something.
 *
 * This page used to describe the rhythm and offer nothing, because NEXUS did
 * not decide its own timing: something outside it called the tick endpoint and
 * every job ran. A time picker then would have stored a preference nothing
 * read, which is worse than no picker at all.
 *
 * `lib/rhythm.ts` now gates each job on these values, per organisation, in the
 * organisation's own timezone. The scheduler ticks hourly; the gate decides
 * when each part of the week actually happens.
 */
export function RhythmForm({
  rhythm,
  timezone,
}: {
  rhythm: RhythmConfig;
  timezone: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [form, setForm] = useState<RhythmConfig>(rhythm);
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(rhythm);
  const set = <K extends keyof RhythmConfig>(key: K, value: RhythmConfig[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  /*
   * The one relationship worth checking. A reminder earlier than the prompt is
   * a reminder about a week nobody has been asked about yet — it would simply
   * never fire, and the page should say so rather than saving something inert.
   */
  const reminderTooEarly = form.reminderHour <= form.promptHour;

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
    <section className="rounded-lg border border-white/[0.09] bg-white/[0.02]">
      <div className="border-b border-white/[0.07] px-4 py-3.5">
        <h2 className="text-base font-medium text-white/90">The weekly rhythm</h2>
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
          <Select
            aria="Hour the week opens"
            value={form.promptHour}
            onChange={(v) => set("promptHour", v)}
            options={hours()}
          />
        </Row>

        <Row
          label="NEXUS chases"
          hint="Only people who have not answered. Anybody who reported hears nothing further."
        >
          <span className="metric self-center text-2xs text-tertiary">
            {DAY_NAME[form.promptDay]}
          </span>
          <Select
            aria="Hour NEXUS chases"
            value={form.reminderHour}
            onChange={(v) => set("reminderHour", v)}
            options={hours()}
            invalid={reminderTooEarly}
          />
        </Row>

        {reminderTooEarly && (
          <p className="px-4 py-2.5 text-xs text-[var(--color-warning)]">
            A chase earlier than the opening would never fire — there is nothing
            to chase yet. Set it after {hourLabel(form.promptHour)}.
          </p>
        )}

        <Row
          label="The Chairman's brief"
          hint="Generated and emailed. Usually the morning after the week settles."
        >
          <Select
            aria="Day the brief is sent"
            value={form.digestDay}
            onChange={(v) => set("digestDay", v)}
            options={Object.entries(DAY_NAME).map(([v, l]) => [Number(v), l])}
          />
          <Select
            aria="Hour the brief is sent"
            value={form.digestHour}
            onChange={(v) => set("digestHour", v)}
            options={hours()}
          />
        </Row>

        <Row
          label="Correction window"
          hint="How long somebody has to review their own reconciliation before it reaches their lead. This is the promise that makes people write the truth."
        >
          <Select
            aria="Correction window in hours"
            value={form.reviewWindowHours}
            onChange={(v) => set("reviewWindowHours", v)}
            options={[6, 12, 24, 36, 48, 72].map((h) => [h, `${h} hours`])}
          />
        </Row>

        <Row
          label="Reporting starts"
          hint="The first week NEXUS reconciles. Leave it empty to start from the day this organisation was created. Set it to skip weeks from before people were actually using NEXUS, where nobody reporting says nothing about anybody."
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

      <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] px-4 py-3">
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
    </section>
  );
}

const hours = (): [number, string][] =>
  Array.from({ length: 24 }, (_, h) => [h, hourLabel(h)]);

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
      <div className="flex shrink-0 gap-2">{children}</div>
    </div>
  );
}

function Select({
  aria,
  value,
  onChange,
  options,
  invalid,
}: {
  aria: string;
  value: number;
  onChange: (v: number) => void;
  options: [number, string][];
  invalid?: boolean;
}) {
  return (
    <select
      aria-label={aria}
      aria-invalid={invalid || undefined}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={
        "min-h-11 rounded-lg border bg-white/[0.03] px-2.5 text-xs text-white/85 " +
        "focus:outline-none " +
        (invalid
          ? "border-[var(--color-warning)]/60"
          : "border-white/[0.10] focus:border-white/25")
      }
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
