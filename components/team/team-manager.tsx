"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { m } from "motion/react";
import {
  Check,
  CircleAlert,
  Copy,
  Loader2,
  Mail,
  MailCheck,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassBadge } from "@/components/ui/glass-badge";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { staggerContainer, staggerItem } from "@/lib/motion-tokens";
import { ROLE_BLURB, ROLE_LABEL, type OrgRole } from "@/lib/roles";
import type { Invitation, Member } from "@/lib/team";

/*
 * The roster.
 *
 * People waiting on a decision are pinned to the top, because until somebody
 * places them they cannot file anything, and an invitation flow that quietly
 * strands people is worse than no invitation flow.
 *
 * Where a person asked for a role, the request is shown as a request — the
 * admin grants it or does not. That asymmetry is the whole security model,
 * and the interface should make it visible rather than hide it behind a
 * dropdown that looks like it was already decided.
 */

const ROLES: OrgRole[] = ["staff", "lead", "hr", "executive", "admin"];

const ROLE_TONE: Record<OrgRole, string> = {
  staff: "var(--color-neutral)",
  lead: "var(--dept-techspecialist)",
  hr: "var(--dept-growth)",
  executive: "var(--dept-creative-hub)",
  admin: "var(--dept-media-hub)",
};

export function TeamManager({
  orgName,
  selfId,
  members,
  invitations,
  departments,
  welcome,
}: {
  orgName: string;
  selfId: string;
  members: Member[];
  invitations: Invitation[];
  departments: { id: string; name: string; color: string }[];
  welcome: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [lastSend, setLastSend] = useState<{ to: string; delivered: boolean; note: string | null } | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("staff");
  const [departmentId, setDepartmentId] = useState("");

  const waiting = members.filter((m) => m.status === "pending");
  const active = members.filter((m) => m.status !== "pending");

  type ApiResult = {
    error?: string;
    link?: string;
    delivered?: boolean;
    deliveryNote?: string | null;
  };

  function call(fn: () => Promise<Response>, after?: (data: ApiResult) => void) {
    startTransition(async () => {
      try {
        const res = await fn();
        const data: ApiResult = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
        after?.(data);
        router.refresh();
      } catch (e) {
        toast({
          variant: "error",
          title: "Something went wrong",
          description: e instanceof Error ? e.message : "An unexpected error occurred.",
        });
      }
    });
  }

  function invite() {
    call(
      () =>
        fetch("/api/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            role,
            departmentId: departmentId || null,
          }),
        }),
      (data) => {
        setLastLink(data.link ?? null);
        setLastSend({
          to: email,
          delivered: Boolean(data.delivered),
          note: data.deliveryNote ?? null,
        });
        setEmail("");
        toast({
          variant: data.delivered ? "success" : "warning",
          title: data.delivered ? "Invitation sent" : "Invitation created",
          description: data.delivered
            ? `Email delivered to ${email}.`
            : `Email delivery failed — send the link manually.`,
        });
      },
    );
  }

  function patchMember(id: string, patch: Record<string, unknown>) {
    call(() =>
      fetch(`/api/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    );
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      toast({
        variant: "error",
        title: "Could not copy",
        description: "Select the link and copy it manually.",
      });
    }
  }

  return (
    <div className="mx-auto max-w-3xl pt-2">
      <h1 className="text-2xl font-medium tracking-tight">People</h1>
      <p className="mt-0.5 text-xs text-tertiary">{orgName}</p>

      {welcome && (
        <GlassCard level={1} className="mt-4 border-l-2 border-l-[var(--color-healthy)] p-4">
          <div className="flex items-start gap-2.5">
            <ShieldCheck
              size={16}
              className="mt-px shrink-0 text-[var(--color-healthy)]"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-white/90">
                {orgName} is ready
              </p>
              <p className="mt-1 text-xs leading-relaxed text-secondary">
                You are its administrator. Invite your team below — the role you
                choose for each person is the role they get, so nobody has to
                decide their own access.
              </p>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ---- invite ------------------------------------------------------ */}
      <GlassCard level={2} className="mt-5 p-4">
        <div className="mb-3 flex items-center gap-2">
          <UserPlus size={15} className="text-[var(--dept-techspecialist)]" aria-hidden="true" />
          <h2 className="text-sm font-medium text-white/90">Invite someone</h2>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-[1fr_auto]">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="h-12 w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-3.5 text-sm text-white/90 placeholder:text-white/25 focus:border-white/25 focus:outline-none"
          />
          <GlassButton
            variant="primary"
            size="lg"
            disabled={pending || !email.includes("@")}
            onClick={invite}
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
            Send invite
          </GlassButton>
        </div>

        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          <label className="block">
            <span className="text-2xs text-tertiary">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as OrgRole)}
              className="mt-1 h-11 w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-2.5 text-sm text-white/90 focus:border-white/25 focus:outline-none"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-2xs text-tertiary">Unit</span>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-2.5 text-sm text-white/90 focus:border-white/25 focus:outline-none"
            >
              {/*
                "No unit yet" read as "this organisation has no units yet",
                which is a different sentence from "do not place them in one".
                Said either way depending on which is actually true, and it
                matches the picker on each member below.
              */}
              <option value="">
                {departments.length === 0 ? "No units yet" : "No unit"}
              </option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-2 text-2xs leading-relaxed text-tertiary">
          {ROLE_BLURB[role]}
        </p>

        {lastLink && (
          <div className="mt-3 rounded-lg border border-white/[0.10] bg-white/[0.03] p-2.5">
            {lastSend?.delivered ? (
              <p className="mb-1.5 flex items-start gap-1.5 text-2xs leading-relaxed text-[var(--color-healthy)]">
                <MailCheck size={12} className="mt-px shrink-0" aria-hidden="true" />
                <span>
                  Emailed to <span className="text-white/80">{lastSend.to}</span>. The
                  link below is the same one, if you would rather send it yourself.
                </span>
              </p>
            ) : (
              <p className="mb-1.5 flex items-start gap-1.5 text-2xs leading-relaxed text-[var(--color-warning)]">
                <CircleAlert size={12} className="mt-px shrink-0" aria-hidden="true" />
                <span>
                  Not emailed — {lastSend?.note ?? "email is not configured"}. The
                  invitation is real and works; send this link yourself.
                </span>
              </p>
            )}
            <div className="flex items-center gap-2">
              <code className="metric min-w-0 flex-1 truncate text-2xs text-white/70">
                {lastLink}
              </code>
              <GlassButton size="sm" variant="secondary" onClick={() => copy(lastLink, "new")}>
                {copied === "new" ? <Check size={13} /> : <Copy size={13} />}
                {copied === "new" ? "Copied" : "Copy"}
              </GlassButton>
            </div>
          </div>
        )}
      </GlassCard>

      {/* ---- waiting ----------------------------------------------------- */}
      {waiting.length > 0 && (
        <section className="mt-7">
          <SectionHeader
            title="Waiting for you"
            hint="They signed up and cannot do anything until you place them."
          />
          <m.ul
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-2"
          >
            {waiting.map((p) => (
              <m.li key={p.profile_id} variants={staggerItem}>
                <GlassCard level={1} className="border-l-2 border-l-[var(--color-warning)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white/90">{p.full_name}</p>
                      <p className="truncate text-2xs text-tertiary">{p.email}</p>
                      {p.requested_role && (
                        <p className="mt-1.5 text-2xs text-tertiary">
                          Asked to be{" "}
                          <span className="text-white/75">
                            {ROLE_LABEL[p.requested_role]}
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        defaultValue={p.requested_role ?? "staff"}
                        onChange={(e) =>
                          patchMember(p.profile_id, {
                            role: e.target.value,
                            status: "active",
                          })
                        }
                        className="h-11 rounded-lg border border-white/[0.12] bg-white/[0.05] px-2.5 text-xs text-white/85 focus:border-white/25 focus:outline-none"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            Approve as {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <GlassButton
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          patchMember(p.profile_id, { status: "suspended" })
                        }
                      >
                        <X size={13} /> Decline
                      </GlassButton>
                    </div>
                  </div>
                </GlassCard>
              </m.li>
            ))}
          </m.ul>
        </section>
      )}

      {/* ---- outstanding invitations ------------------------------------- */}
      {invitations.length > 0 && (
        <section className="mt-7">
          <SectionHeader title="Invitations out" hint="Not accepted yet." />
          <ul className="space-y-2">
            {invitations.map((i) => (
              <li key={i.id}>
                <GlassCard level={1} className="p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white/90">{i.email}</p>
                      <p className="text-2xs text-tertiary">
                        {ROLE_LABEL[i.role]}
                        {i.department_name ? ` · ${i.department_name}` : ""}
                      </p>
                    </div>
                    <GlassButton
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        call(() =>
                          fetch(`/api/invitations/${i.id}`, { method: "DELETE" }),
                        )
                      }
                    >
                      <X size={13} /> Revoke
                    </GlassButton>
                  </div>
                </GlassCard>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- everyone ---------------------------------------------------- */}
      <section className="mt-7">
        <SectionHeader
          title="Members"
          hint={`${active.length} ${active.length === 1 ? "person" : "people"}`}
        />
        {active.length === 0 ? (
          <GlassCard level={1}>
            <EmptyState
              icon={UserPlus}
              title="Nobody has joined yet"
              body="Invite your team above. Each invitation carries the role you chose, so people never pick their own access."
            />
          </GlassCard>
        ) : (
          <ul className="space-y-2">
            {active.map((p) => (
              <li key={p.profile_id}>
                <GlassCard level={1} className="p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="grid size-8 shrink-0 place-items-center rounded-full text-2xs font-medium"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${p.color ?? "#7d8590"} 20%, transparent)`,
                          color: p.color ?? "#aab",
                        }}
                      >
                        {p.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white/90">
                          {p.full_name}
                          {p.profile_id === selfId && (
                            <span className="ml-1.5 text-2xs text-tertiary">you</span>
                          )}
                        </p>
                        <p className="truncate text-2xs text-tertiary">
                          {p.email}
                          {p.status === "suspended" ? " · suspended" : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {/*
                        WHICH UNIT SOMEBODY IS IN, AS A CONTROL.

                        This was a line of grey text reading "No unit", and the
                        only place a unit could ever be set was the invitation
                        form — so anybody already in the organisation was stuck
                        wherever they had landed, and somebody who joined before
                        the units existed could never be placed at all. The API
                        has always accepted `departmentId`; nothing offered it.

                        Offered for yourself too. An administrator creates the
                        units, and being the one person who cannot join one is
                        the wrong way round.
                      */}
                      <select
                        value={p.department_id ?? ""}
                        disabled={pending || departments.length === 0}
                        onChange={(e) =>
                          patchMember(p.profile_id, {
                            departmentId: e.target.value || null,
                          })
                        }
                        aria-label={`Unit for ${p.full_name}`}
                        className="h-11 max-w-[11rem] rounded-lg border border-white/[0.12] bg-white/[0.05] px-2 text-xs text-white/85 focus:border-white/25 focus:outline-none disabled:opacity-40"
                      >
                        <option value="">
                          {departments.length === 0 ? "No units yet" : "No unit"}
                        </option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>

                      <GlassBadge tone={ROLE_TONE[p.role]}>{ROLE_LABEL[p.role]}</GlassBadge>
                      {p.profile_id !== selfId && (
                        <select
                          value={p.role}
                          disabled={pending}
                          onChange={(e) =>
                            patchMember(p.profile_id, { role: e.target.value })
                          }
                          aria-label={`Role for ${p.full_name}`}
                          className="h-11 rounded-lg border border-white/[0.12] bg-white/[0.05] px-2 text-xs text-white/85 focus:border-white/25 focus:outline-none"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </GlassCard>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-7 text-2xs leading-relaxed text-tertiary">
        Roles are enforced in the database, not in this page. Changing somebody
        here changes which rows their queries can return at all — so a stale tab
        or a hand-made request cannot get around it.
      </p>
    </div>
  );
}
