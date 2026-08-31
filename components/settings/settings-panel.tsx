"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";
import type { PersonalSettings } from "@/lib/settings-vocabulary";
import { TIMEZONES, hourLabel } from "@/lib/settings-vocabulary";

/*
 * Profile & Settings — the person, not the organisation.
 *
 * Everything here is read by something. Quiet hours and the notification
 * switches are checked by `enqueue_notification` before anything is sent, and
 * the timezone decides what "today" means for the daily message budget. There
 * is no control on this page that exists to give the page something to show.
 *
 * WHAT IS NOT HERE
 *
 * No avatar upload: there is no file storage configured, and a control that
 * opens a picker and then cannot keep the file is worse than its absence. No
 * language: the product is English only. No "delete my account": leaving an
 * organisation is an administrative act, and a button that silently did
 * nothing would be the worst possible version of it.
 */
export function SettingsPanel({
  settings,
  roleLabel,
  identityLine,
  privacy,
  canReplayIntro,
}: {
  settings: PersonalSettings;
  roleLabel: string;
  /** "Staff · Department Lead" — what this person is in the organisation. */
  identityLine: string;
  /** Who can see what, from the real rules. Server-rendered sentences. */
  privacy: string[];
  /** Only somebody who files a week has an introduction to replay. */
  canReplayIntro: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [fullName, setFullName] = useState(settings.fullName);
  const [title, setTitle] = useState(settings.title ?? "");
  const [timezone, setTimezone] = useState(settings.timezone);
  const [quietStart, setQuietStart] = useState(settings.quietHoursStart);
  const [quietEnd, setQuietEnd] = useState(settings.quietHoursEnd);
  const [notifications, setNotifications] = useState(settings.notifications);
  const [saving, setSaving] = useState(false);

  const dirty =
    fullName.trim() !== settings.fullName ||
    title.trim() !== (settings.title ?? "") ||
    timezone !== settings.timezone ||
    quietStart !== settings.quietHoursStart ||
    quietEnd !== settings.quietHoursEnd ||
    JSON.stringify(notifications) !== JSON.stringify(settings.notifications);

  async function replayIntro() {
    try {
      const res = await fetch("/api/onboarding/welcome", { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      toast({
        variant: "success",
        title: "Ready",
        description: "The introduction is waiting at the top of your week.",
      });
      router.push("/my-week");
    } catch {
      toast({
        variant: "error",
        title: "Could not do that",
        description: "NEXUS could not be reached. Try again in a moment.",
      });
    }
  }

  async function save() {
    if (!fullName.trim()) {
      toast({
        variant: "error",
        title: "You need a name",
        description: "It is what your lead and the Chairman see beside your week.",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          title: title.trim() || null,
          timezone,
          quietHoursStart: quietStart,
          quietHoursEnd: quietEnd,
          notifications,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Could not save (${res.status})`);
      toast({ variant: "success", title: "Saved", description: "Your settings are updated." });
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
    <div className="flex flex-col gap-5">
      {/* ---- profile ----------------------------------------------------- */}
      <Section title="Profile" blurb="How you appear to the rest of the organisation.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" hint="Shown beside your week wherever it appears.">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
              className={input}
            />
          </Field>
          <Field label="Job title" hint="Optional.">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Backend engineer"
              className={input}
            />
          </Field>
        </div>

        {/*
          Department and lead are shown and NOT editable. Which unit somebody
          belongs to is an organisational decision, and a dropdown here would
          let anybody reassign themselves out from under their lead. It is on
          this page because "who is my lead" is a question people genuinely
          have, and because leaving it off makes the page look like it forgot.
        */}
        <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-white/[0.07] pt-4 sm:grid-cols-[10rem_1fr]">
          <dt className="note">Email</dt>
          <dd className="text-xs text-white/75">{settings.email}</dd>
          <dt className="note">Unit</dt>
          <dd className="text-xs text-white/75">
            {settings.departmentName ?? "Not placed in a unit yet"}
          </dd>
          <dt className="note">Lead</dt>
          <dd className="text-xs text-white/75">{settings.leadName ?? "None assigned"}</dd>
          <dt className="note">In the organisation as</dt>
          <dd className="text-xs text-white/75">{identityLine}</dd>
        </dl>
        <p className="note mt-3">
          Your unit, your lead and what you can do are set by an administrator.
          Ask them if any of it is wrong.
        </p>
      </Section>

      {/* ---- when NEXUS may reach you ------------------------------------ */}
      <Section
        title="When NEXUS may reach you"
        blurb="Quiet hours are enforced before anything is sent, not filtered afterwards."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Timezone" hint="Decides your working day and what counts as today.">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={input}
            >
              {!TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Quiet from" hint="Nothing is delivered inside this window.">
            <select
              value={quietStart}
              onChange={(e) => setQuietStart(Number(e.target.value))}
              className={input}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Quiet until" hint="Held messages arrive after this.">
            <select
              value={quietEnd}
              onChange={(e) => setQuietEnd(Number(e.target.value))}
              className={input}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {/*
          Said out loud because the alternative reading — "my reminder was
          eaten" — is the one people reach for, and it is wrong.
        */}
        <p className="note mt-3">
          Nothing inside your quiet hours is discarded. It is held and delivered
          afterwards. A genuine escalation is exempt.
        </p>
      </Section>

      {/* ---- what NEXUS may send ----------------------------------------- */}
      <Section
        title="What NEXUS may send"
        blurb="Turning one off stops it being sent at all — it is checked before delivery, not hidden after."
      >
        <div className="flex flex-col">
          <Toggle
            label="Reminders about your week"
            hint="A nudge when your update is still open. Never more than the daily budget allows."
            on={notifications.nudges}
            onChange={(v) => setNotifications((p) => ({ ...p, nudges: v }))}
          />
          <Toggle
            label="Weekly summary"
            hint="Your own week, once it settles."
            on={notifications.weeklyDigest}
            onChange={(v) => setNotifications((p) => ({ ...p, weeklyDigest: v }))}
          />
          <Toggle
            label="Email"
            hint="Off means NEXUS reaches you in the app only."
            on={notifications.email}
            onChange={(v) => setNotifications((p) => ({ ...p, email: v }))}
          />
          <Toggle
            label="In the app"
            hint="The Alerts tab."
            on={notifications.inApp}
            onChange={(v) => setNotifications((p) => ({ ...p, inApp: v }))}
          />
        </div>
      </Section>

      {/* ---- account ----------------------------------------------------- */}
      <Section title="Account" blurb="How you sign in.">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr]">
          <dt className="note">Signed in with</dt>
          <dd className="text-xs text-white/75">{providerLabel(settings.authProvider)}</dd>
          <dt className="note">Joined</dt>
          <dd className="text-xs text-white/75">
            {settings.joinedAt
              ? new Date(settings.joinedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "Unknown"}
          </dd>
          <dt className="note">Role label</dt>
          <dd className="text-xs text-white/75">{roleLabel}</dd>
        </dl>
        {/*
          No "change password" and no "sign out everywhere". Identity is held by
          the provider, not by NEXUS, and offering a control that cannot do
          anything is how a security page stops being believed.
        */}
        <p className="note mt-3">
          Your password and sign-in security are managed by your identity
          provider, not by NEXUS.
        </p>
      </Section>

      {/* ---- the introduction -------------------------------------------- */}
      {canReplayIntro && (
        <Section
          title="The introduction"
          blurb="The three things NEXUS explains when somebody joins."
        >
          <button
            type="button"
            onClick={() => void replayIntro()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border
                       border-white/[0.12] px-4 text-sm text-white/85
                       transition-colors hover:bg-white/[0.06]"
          >
            Read it again
          </button>
          <p className="note mt-2">
            It appears at the top of your week the next time you open it.
          </p>
        </Section>
      )}

      {/* ---- privacy ----------------------------------------------------- */}
      <Section
        title="Privacy"
        blurb="Who can see what you write. These are the rules the database enforces, not a policy statement."
      >
        <ul className="flex flex-col gap-2">
          {privacy.map((line) => (
            <li key={line} className="body-sm flex gap-2.5">
              <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-white/30" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/*
        Sticky, and OPAQUE.
        
        A settings page is long enough that a save button at the bottom is a
        button people scroll past and forget, so it follows. It was translucent
        at first and the section headings underneath showed through it — a bar
        that half-reveals what it is covering reads as a rendering fault rather
        than as a control.
        
        Clear of the phone's bottom bar, and near the edge on desktop where
        there is none.
      */}
      <div className="on-dark sticky bottom-24 z-10 flex items-center justify-between gap-3 rounded-lg border border-white/[0.12] bg-[var(--void)] px-4 py-3 shadow-lg shadow-black/40 md:bottom-4">
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
    </div>
  );
}

function providerLabel(provider: string | null): string {
  if (!provider) return "Email";
  if (/azure|entra|microsoft/i.test(provider)) return "Microsoft";
  if (/google/i.test(provider)) return "Google";
  if (provider === "dev") return "Demo persona (development only)";
  return provider;
}

const input =
  "min-h-11 w-full rounded-lg border border-white/[0.10] bg-white/[0.03] px-3 text-sm " +
  "text-white/90 placeholder:text-white/25 focus:border-white/25 focus:outline-none";

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/[0.09] bg-white/[0.02]">
      <div className="border-b border-white/[0.07] px-4 py-3.5">
        <h2 className="text-base font-medium text-white/90">{title}</h2>
        <p className="note mt-1">{blurb}</p>
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

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

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className="flex min-h-11 items-start justify-between gap-4 border-b border-white/[0.05]
                 py-3 text-left last:border-b-0"
    >
      <span className="min-w-0">
        <span className="block text-sm text-white/90">{label}</span>
        <span className="note mt-0.5 block">{hint}</span>
      </span>
      {/*
        A switch, not a checkbox: this is a preference that takes effect, and
        the affordance should read as "on/off" rather than "selected".
      */}
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors",
          on ? "bg-[var(--dept-techspecialist)]" : "bg-white/[0.14]",
        )}
      >
        <span
          className={cn(
            "size-5 rounded-full bg-white transition-transform",
            on ? "translate-x-4" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}
