"use client";

import { useState, useTransition } from "react";
import {
  Building2,
  CircleAlert,
  Loader2,
  Mail,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { useToast } from "@/components/ui/toast";
import { ROLE_BLURB, ROLE_LABEL, type OrgRole } from "@/lib/roles";
import type { InvitePreview } from "@/lib/onboarding";

/*
 * Becoming a member.
 *
 * The role dropdown here is deliberately NOT a role dropdown. When somebody
 * self-signs-up they choose what to REQUEST, and the screen says plainly that
 * it is a request — because a picker that silently grants "Chairman" would
 * hand any user with a matching email domain the whole organisation's numbers.
 *
 * On the invitation path there is no picker at all: the role was decided by
 * whoever sent it, and is shown as a fact.
 */

const REQUESTABLE: OrgRole[] = ["staff", "lead", "hr"];

export function OnboardingPanel({
  identity,
  token,
  invitation,
  joinable,
  departments,
}: {
  identity: { email: string; name: string | null; provider: string };
  token: string | null;
  invitation: InvitePreview | null;
  joinable: { id: string; name: string; slug: string }[];
  departments: { id: string; name: string; color: string }[];
}) {
  const { toast } = useToast();
  const [fullName, setFullName] = useState(identity.name ?? "");
  const [orgName, setOrgName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [requestedRole, setRequestedRole] = useState<OrgRole>("staff");
  const [pending, startTransition] = useTransition();

  const emailMismatch =
    invitation && invitation.email.toLowerCase() !== identity.email.toLowerCase();

  function post(body: Record<string, unknown>) {
    startTransition(async () => {
      try {
        const res = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
        // Full load: membership has just been created, and every server
        // component above this point needs to resolve against it.
        window.location.assign(data.redirect ?? "/");
      } catch (e) {
        toast({
          variant: "error",
          title: "Could not complete",
          description: e instanceof Error ? e.message : "Something went wrong.",
        });
      }
    });
  }

  // ---- invitation ------------------------------------------------------
  if (invitation) {
    return (
      <GlassCard level={2} className="p-6">
        <Header
          icon={<Mail size={19} className="text-[var(--dept-techspecialist)]" />}
          title={`Join ${invitation.orgName}`}
          subtitle={
            invitation.invitedBy
              ? `${invitation.invitedBy} invited you.`
              : "You have been invited."
          }
        />

        <dl className="mb-5 space-y-2 rounded-lg bg-white/[0.04] px-4 py-3">
          <Row label="Role" value={ROLE_LABEL[invitation.role]} />
          {invitation.departmentName && (
            <Row label="Unit" value={invitation.departmentName} />
          )}
          <Row label="Sent to" value={invitation.email} />
        </dl>

        <p className="mb-4 text-2xs leading-relaxed text-tertiary">
          {ROLE_BLURB[invitation.role]} This role was chosen by whoever invited
          you — it is not something you set here.
        </p>

        {emailMismatch ? (
          <p className="flex items-start gap-2 rounded-lg border border-[var(--color-critical)]/30 bg-[var(--color-critical)]/10 px-3 py-2.5 text-xs leading-relaxed text-[var(--color-critical)]">
            <CircleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />
            <span>
              This invitation was sent to{" "}
              <span className="metric">{invitation.email}</span>, but you are
              signed in as <span className="metric">{identity.email}</span>. Sign
              in with the invited address to accept it.
            </span>
          </p>
        ) : (
          <>
            <NameField value={fullName} onChange={setFullName} />
        <GlassButton
          variant="primary"
          size="lg"
          className="mt-4 w-full"
          disabled={pending || !fullName.trim()}
          onClick={() => post({ action: "accept", token, fullName })}
        >
          {pending ? <Spinner /> : `Join ${invitation.orgName}`}
        </GlassButton>
          </>
        )}
      </GlassCard>
    );
  }

  // ---- join an organisation that published this domain -----------------
  if (joinable.length > 0) {
    const org = joinable[0];
    return (
      <GlassCard level={2} className="p-6">
        <Header
          icon={<UserPlus size={19} className="text-[var(--dept-techspecialist)]" />}
          title={`Join ${org.name}`}
          subtitle={`Your email domain is recognised by ${org.name}.`}
        />

        <NameField value={fullName} onChange={setFullName} />

        {departments.length > 0 && (
          <label className="mt-3 block">
            <span className="text-xs font-medium text-white/80">Your unit</span>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="mt-1.5 h-12 w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 text-sm text-white/90 focus:border-white/25 focus:outline-none"
            >
              <option value="">
                Not sure yet
              </option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <fieldset className="mt-4">
          <legend className="text-xs font-medium text-white/80">
            What do you do here?
          </legend>
          <p className="mt-1 text-2xs leading-relaxed text-tertiary">
            This is a request, not a setting. Everyone starts as a team member;
            an administrator confirms anything above that.
          </p>
          <div className="mt-2.5 space-y-1.5">
            {REQUESTABLE.map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                  requestedRole === r
                    ? "border-[var(--dept-techspecialist)]/50 bg-[var(--dept-techspecialist)]/12"
                    : "border-white/[0.10] bg-white/[0.03] hover:bg-white/[0.06]"
                }`}
              >
                <input
                  type="radio"
                  name="requestedRole"
                  value={r}
                  checked={requestedRole === r}
                  onChange={() => setRequestedRole(r)}
                  className="mt-1 accent-[var(--dept-techspecialist)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-white/90">{ROLE_LABEL[r]}</span>
                  <span className="block text-2xs leading-snug text-tertiary">
                    {ROLE_BLURB[r]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <GlassButton
          variant="primary"
          size="lg"
          className="mt-4 w-full"
          disabled={pending || !fullName.trim()}
          onClick={() =>
            post({
              action: "join",
              orgSlug: org.slug,
              fullName,
              departmentId: departmentId || null,
              requestedRole,
            })
          }
        >
          {pending ? <Spinner /> : "Request to join"}
        </GlassButton>
      </GlassCard>
    );
  }

  // ---- create an organisation ------------------------------------------
  return (
    <GlassCard level={2} className="p-6">
      <Header
        icon={<Building2 size={19} className="text-[var(--dept-techspecialist)]" />}
        title="Set up your organisation"
        subtitle={`Signed in as ${identity.email}`}
      />

      <label className="block">
        <span className="text-xs font-medium text-white/80">Organisation name</span>
        <input
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="Techspecialist Consulting Limited"
          className="mt-1.5 h-12 w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-3.5 text-sm text-white/90 placeholder:text-white/25 focus:border-white/25 focus:outline-none"
        />
      </label>

      <div className="mt-3">
        <NameField value={fullName} onChange={setFullName} />
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-lg bg-white/[0.04] px-3 py-2.5 text-2xs leading-relaxed text-tertiary">
        <ShieldCheck size={13} className="mt-px shrink-0 text-[var(--color-healthy)]" aria-hidden="true" />
        <span>
          You will be its administrator, and the only person who can invite
          others or change what anybody may see. Eight weeks of reporting
          calendar are created so the first standup has somewhere to land.
        </span>
      </p>

      <GlassButton
        variant="primary"
        size="lg"
        className="mt-4 w-full"
        disabled={pending || !orgName.trim() || !fullName.trim()}
        onClick={() => post({ action: "create", orgName, fullName })}
      >
        {pending ? <Spinner /> : "Create organisation"}
      </GlassButton>
    </GlassCard>
  );
}

/* ---------------------------------------------------------------- helpers */

function Header({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-5">
      <span
        aria-hidden="true"
        className="mb-3 grid size-10 place-items-center rounded-xl bg-[var(--dept-techspecialist)]/15"
      >
        {icon}
      </span>
      <h1 className="text-xl font-medium tracking-tight">{title}</h1>
      <p className="mt-1 text-xs text-tertiary">{subtitle}</p>
    </div>
  );
}

function NameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-white/80">Your name</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ada Nwosu"
        autoComplete="name"
        className="mt-1.5 h-12 w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-3.5 text-sm text-white/90 placeholder:text-white/25 focus:border-white/25 focus:outline-none"
      />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-xs">
      <dt className="text-tertiary">{label}</dt>
      <dd className="truncate text-white/85">{value}</dd>
    </div>
  );
}

function Spinner() {
  return (
    <>
      <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Working
    </>
  );
}
