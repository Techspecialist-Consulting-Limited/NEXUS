import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { currentIdentity, currentMembership, ROLE_LABEL } from "@/lib/auth";
import { homeFor } from "@/lib/nav";
import { GlassCard } from "@/components/ui/glass-card";

export const dynamic = "force-dynamic";

/**
 * Waiting for an administrator.
 *
 * Someone who self-signed-up is a real member of the organisation with the
 * lowest role, not a rejected stranger — so this says what happens next and
 * who is deciding, rather than showing a locked door.
 */
export default async function PendingPage() {
  const identity = await currentIdentity();
  if (!identity) redirect("/login");

  const membership = await currentMembership(identity);
  if (!membership) redirect("/onboarding");
  if (membership.status === "active") redirect(homeFor(membership.role));

  return (
    <GlassCard level={2} className="p-6 text-center">
      <span
        aria-hidden="true"
        className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-white/[0.06]"
      >
        <Clock size={19} className="text-white/60" />
      </span>

      <h1 className="text-xl font-medium tracking-tight">
        You&rsquo;re in {membership.orgName}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-secondary">
        Your account is waiting for an administrator to confirm your unit and
        role. You&rsquo;ll be able to file your first standup as soon as that
        happens.
      </p>

      <dl className="mt-5 space-y-2 rounded-lg bg-white/[0.04] px-4 py-3 text-left">
        <div className="flex justify-between gap-4 text-xs">
          <dt className="text-tertiary">Signed in as</dt>
          <dd className="truncate text-white/80">{identity.email}</dd>
        </div>
        <div className="flex justify-between gap-4 text-xs">
          <dt className="text-tertiary">Current access</dt>
          <dd className="text-white/80">{ROLE_LABEL[membership.role]}</dd>
        </div>
      </dl>

      <p className="mt-5 text-2xs leading-relaxed text-tertiary">
        Nobody is given a role by asking for one. An administrator grants it,
        which is what stops a sign-up form from becoming a way into the whole
        organisation&rsquo;s numbers.
      </p>
    </GlassCard>
  );
}
