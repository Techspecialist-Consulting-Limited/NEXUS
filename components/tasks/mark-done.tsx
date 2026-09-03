"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";

/*
 * Mark a commitment delivered, from the list.
 *
 * WHY THIS DOES NOT BYPASS THE CHECK-IN.
 *
 * NEXUS's premise is that status comes from what somebody reports, not from
 * ticking boxes, so a "done" button looks at first like a way around the
 * reporting loop. It is not, because of one field.
 *
 * `POST /api/commitments/[id]/status` sends `declared: true`, and the scoring
 * in migration 0004 treats a declared change very differently from the same
 * status arriving in silence. Pressing this IS telling NEXUS what happened —
 * it is the same act as saying it in a check-in, in one tap instead of a
 * sentence. What it can never do is be silent.
 *
 * The write goes through asActor(), so RLS decides: an id belonging to
 * somebody else's week updates nothing and returns 404.
 *
 * ONLY DELIVERED. Every other transition — blocked, dropped, deferred —
 * carries a reason that matters more than the status, and those belong in the
 * check-in where the reason can be captured. A one-tap "dropped" with no
 * explanation is exactly the silent drop this product exists to surface.
 */

export function MarkDone({
  commitmentId,
  title,
}: {
  commitmentId: string;
  title: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  async function mark() {
    setBusy(true);
    try {
      const res = await fetch(`/api/commitments/${commitmentId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "delivered", declared: true }),
      });

      if (!res.ok) {
        toast({
          variant: "error",
          title: "That could not be marked done",
          description:
            res.status === 404
              ? "This is no longer yours to change."
              : "Nothing was saved. Try again.",
        });
        return;
      }

      toast({
        variant: "success",
        title: "Marked delivered",
        /*
          Says what it recorded, not just that it worked. "You told NEXUS" is
          the part that matters — it is what keeps this out of the silent-drop
          count when the week reconciles.
        */
        description: `“${title}” is delivered, and NEXUS has it as declared.`,
      });
      start(() => router.refresh());
    } catch {
      toast({
        variant: "error",
        title: "NEXUS could not be reached",
        description: "Nothing was saved.",
      });
    } finally {
      setBusy(false);
    }
  }

  const working = busy || pending;

  return (
    <button
      type="button"
      onClick={mark}
      disabled={working}
      aria-label={`Mark “${title}” as done`}
      title="Mark as done"
      className="nx-focus-ring inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg
                 border border-[var(--color-delivered)]/35 bg-[rgba(79,191,168,0.08)] px-2.5 text-[12px]
                 font-medium text-[var(--color-delivered)] transition-colors
                 hover:bg-[rgba(79,191,168,0.14)] disabled:opacity-45"
    >
      {working ? (
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
      ) : (
        <Check size={14} aria-hidden="true" />
      )}
      <span className="hidden sm:inline">Done</span>
    </button>
  );
}
