"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";
import { WEEKDAY_LABEL, type OrganizationProfile } from "@/lib/org-vocabulary";

/*
 * The organisation's profile.
 *
 * Six fields, and deliberately not a wizard step somebody has to finish before
 * the product will work. NEXUS runs on the name and the timezone; industry,
 * country and working days describe the organisation rather than driving it,
 * and the form says so rather than implying every blank is a blocker.
 *
 * Nothing here is validated into submission. An organisation whose working
 * week is Sunday to Thursday is not an error, and neither is a blank industry.
 */

const TIMEZONES = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Singapore",
  "UTC",
];

const DAYS = [1, 2, 3, 4, 5, 6, 7];

export function OrganizationForm({ org }: { org: OrganizationProfile }) {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState(org.name);
  const [timezone, setTimezone] = useState(org.timezone);
  const [industry, setIndustry] = useState(org.industry ?? "");
  const [country, setCountry] = useState(org.country ?? "");
  const [workingDays, setWorkingDays] = useState<number[]>(org.workingDays);
  const [saving, setSaving] = useState(false);

  const dirty =
    name.trim() !== org.name ||
    timezone !== org.timezone ||
    industry.trim() !== (org.industry ?? "") ||
    country.trim() !== (org.country ?? "") ||
    workingDays.join(",") !== org.workingDays.join(",");

  function toggleDay(day: number) {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }

  async function save() {
    if (!name.trim()) {
      toast({
        variant: "error",
        title: "The organisation needs a name",
        description: "It appears on every digest and invitation NEXUS sends.",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          timezone,
          industry: industry.trim() || null,
          country: country.trim() || null,
          workingDays,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Could not save (${res.status})`);

      toast({ variant: "success", title: "Saved", description: "The organisation profile is updated." });
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
        <h2 className="text-base font-medium text-white/90">Organisation profile</h2>
        <p className="note mt-1">
          The name and timezone are used by every digest, reminder and reporting
          week. The rest is description.
        </p>
      </div>

      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
        <Field label="Name" hint="Appears on invitations and the Chairman's digest.">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            className={input}
          />
        </Field>

        <Field label="Timezone" hint="Reporting weeks and quiet hours are read in this zone.">
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className={input}
          >
            {/* Keep an unrecognised stored value selectable rather than silently changing it. */}
            {!TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Industry" hint="Optional.">
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            maxLength={80}
            placeholder="Consulting"
            className={input}
          />
        </Field>

        <Field label="Country" hint="Optional.">
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            maxLength={80}
            placeholder="Nigeria"
            className={input}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Working days"
            hint="Which days count as the working week. NEXUS does not chase anybody outside them."
          >
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((day) => {
                const on = workingDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    aria-pressed={on}
                    className={cn(
                      "min-h-11 rounded-lg border px-3.5 text-xs transition-colors",
                      on
                        ? "border-[var(--dept-techspecialist)]/50 bg-[var(--dept-techspecialist)]/15 text-white/95"
                        : "border-white/[0.10] bg-white/[0.03] text-white/55 hover:bg-white/[0.07]",
                    )}
                  >
                    {WEEKDAY_LABEL[day]}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] px-4 py-3">
        <p className="note">{dirty ? "Unsaved changes." : "Everything is saved."}</p>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving}
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

const input =
  "min-h-11 w-full rounded-lg border border-white/[0.10] bg-white/[0.03] px-3 text-sm " +
  "text-white/90 placeholder:text-white/25 focus:border-white/25 focus:outline-none";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white/75">{label}</span>
      <span className="note mt-0.5 block">{hint}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
