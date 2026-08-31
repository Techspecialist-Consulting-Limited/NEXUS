"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, Loader2, Trash2 } from "lucide-react";
import type { OrganizationSummary } from "@/lib/organizations";
import { useToast } from "@/components/ui/toast";

/*
 * Every organisation in the database, and the one way to remove one.
 *
 * WHY THE CONFIRMATION IS A TYPED NAME AND NOT A SECOND BUTTON.
 *
 * "Are you sure?" is answered yes by everybody, including the person who
 * misread which row they were on. Typing the organisation's name is the only
 * confirmation that requires reading the thing being destroyed — and this
 * screen exists precisely so that a tester can do this repeatedly, which is
 * exactly the habit that makes a confirm dialog stop working.
 *
 * The counts are on the row for the same reason. "Delete Techspecialist
 * Consulting" means nothing; "and its 7 people, 4 units and 31 commitments"
 * is the sentence somebody can check against what they meant to do.
 */

function receiptLine(r: {
  name: string;
  people: number;
  departments: number;
  cycles: number;
  check_ins: number;
  commitments: number;
  accounts: number;
}): string {
  const parts = [
    `${r.people} ${r.people === 1 ? "person" : "people"}`,
    `${r.departments} ${r.departments === 1 ? "unit" : "units"}`,
    `${r.check_ins} ${r.check_ins === 1 ? "check-in" : "check-ins"}`,
    `${r.commitments} ${r.commitments === 1 ? "commitment" : "commitments"}`,
  ];
  if (r.accounts > 0) {
    parts.push(`${r.accounts} sign-in ${r.accounts === 1 ? "account" : "accounts"}`);
  }
  return `${r.name} is gone, with ${parts.join(", ")}.`;
}

export function OrganizationsManager({
  organizations,
  currentOrgId,
}: {
  organizations: OrganizationSummary[];
  /** The caller's own organisation, so the row can say so. */
  currentOrgId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [openId, setOpenId] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [dropAuth, setDropAuth] = useState(false);
  const [busy, setBusy] = useState(false);

  function begin(id: string) {
    setOpenId((prev) => (prev === id ? null : id));
    setTyped("");
    setDropAuth(false);
  }

  async function remove(org: OrganizationSummary) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: org.id,
          confirmName: typed,
          dropAuth,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        receipt?: Parameters<typeof receiptLine>[0];
        deletedSelf?: boolean;
      };

      if (!res.ok || !data.receipt) {
        toast({
          variant: "error",
          title: "Nothing was deleted",
          description: data.error ?? "That could not be deleted.",
        });
        return;
      }

      toast({
        variant: "success",
        title: "Organisation deleted",
        description: receiptLine(data.receipt),
      });
      setOpenId(null);
      setTyped("");

      /*
       * If they deleted the organisation they were signed in to, their profile
       * went with it and every page in the product will now bounce them.
       *
       * The root is the right destination for both outcomes, and it is one
       * line rather than two guesses: with the sign-in account kept, app/page
       * finds no membership and sends them to /onboarding to start a fresh
       * organisation — which is the whole reason this screen exists. With the
       * account deleted too, there is no session and it sends them to /login.
       */
      if (data.deletedSelf) {
        router.push("/");
      }
      router.refresh();
    } catch {
      toast({
        variant: "error",
        title: "That could not be deleted",
        description: "Nothing was removed.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
        The security position, on the screen rather than only in a comment.
        Whoever opens this page is the person who needs to know that it is not
        yet safe to hand to anybody else.
      */}
      <p className="flex items-start gap-2 rounded-lg border border-[var(--color-warning)]/30
                    bg-[var(--color-warning)]/[0.08] px-4 py-3 text-sm leading-relaxed
                    text-[var(--color-warning)]">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          This page lists every organisation in the database, not only yours,
          and anybody holding administration capability can delete any of them.
          That is a pilot-stage decision. Lock it down before a second real
          organisation exists here.
        </span>
      </p>

      {organizations.length === 0 ? (
        <p className="text-sm text-secondary">No organisations exist yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {organizations.map((org) => {
            const mine = org.id === currentOrgId;
            const open = openId === org.id;
            const armed = typed.trim() === org.name;

            return (
              <li
                key={org.id}
                className="rounded-xl border border-white/[0.13] bg-white/[0.04] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg
                                 bg-[var(--dept-techspecialist)]/20 text-[var(--dept-techspecialist)]"
                    >
                      <Building2 size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-white/90">
                        {org.name}
                        {mine && (
                          <span className="rounded-md bg-white/[0.10] px-2 py-0.5 text-2xs text-white/70">
                            you are signed in here
                          </span>
                        )}
                      </p>
                      {/*
                        What would go with it. Counted from the database, not
                        estimated: this is the sentence somebody checks their
                        intention against.
                      */}
                      <p className="mt-1 text-xs leading-relaxed text-secondary">
                        <span className="metric">{org.people}</span>{" "}
                        {org.people === 1 ? "person" : "people"} ·{" "}
                        <span className="metric">{org.departments}</span>{" "}
                        {org.departments === 1 ? "unit" : "units"} ·{" "}
                        <span className="metric">{org.cycles}</span>{" "}
                        {org.cycles === 1 ? "week" : "weeks"} ·{" "}
                        <span className="metric">{org.check_ins}</span>{" "}
                        {org.check_ins === 1 ? "check-in" : "check-ins"} ·{" "}
                        <span className="metric">{org.commitments}</span>{" "}
                        {org.commitments === 1 ? "commitment" : "commitments"}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => begin(org.id)}
                    aria-expanded={open}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg
                               border border-[var(--color-critical)]/40 bg-[var(--color-critical)]/10
                               px-3.5 text-sm text-[var(--color-critical)]
                               transition-colors hover:bg-[var(--color-critical)]/20"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    {open ? "Cancel" : "Delete"}
                  </button>
                </div>

                {open && (
                  <div className="mt-4 rounded-lg border border-[var(--color-critical)]/30 bg-[var(--color-critical)]/[0.07] p-4">
                    <p className="text-sm leading-relaxed text-white/90">
                      This cannot be undone. Everything above goes, along with
                      every reconciliation, insight, digest and audit entry that
                      belongs to {org.name}.
                    </p>

                    <label className="mt-3 block">
                      <span className="block text-sm text-white/85">
                        Type <strong className="font-medium">{org.name}</strong>{" "}
                        to confirm
                      </span>
                      <input
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                        aria-label={`Type ${org.name} to confirm deletion`}
                        className="mt-1.5 min-h-11 w-full rounded-lg border border-white/[0.16]
                                   bg-white/[0.07] px-3 text-sm text-white/90
                                   placeholder:text-white/40 focus:border-[var(--color-critical)]/60
                                   focus:outline-none"
                        placeholder={org.name}
                      />
                    </label>

                    <label className="mt-3 flex items-start gap-2.5 text-sm leading-relaxed text-white/85">
                      <input
                        type="checkbox"
                        checked={dropAuth}
                        onChange={(e) => setDropAuth(e.target.checked)}
                        className="mt-0.5 size-4 shrink-0 accent-[var(--color-critical)]"
                      />
                      <span>
                        Also delete their sign-in accounts.
                        {/*
                          The consequence of NOT doing it, because it is not
                          obvious and it is the thing a tester will hit next.
                        */}
                        <span className="mt-0.5 block text-xs text-secondary">
                          Leave this off and those email addresses can still
                          sign in — they land on onboarding and can start a new
                          organisation. An account somebody still holds a
                          profile in elsewhere is never removed.
                        </span>
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={() => void remove(org)}
                      disabled={!armed || busy}
                      className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg
                                 bg-[var(--color-critical)] px-4 text-sm font-medium text-[var(--on-accent)]
                                 transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {busy ? (
                        <>
                          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                          Deleting…
                        </>
                      ) : (
                        <>
                          <Trash2 size={14} aria-hidden="true" />
                          Delete {org.name} permanently
                        </>
                      )}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
