"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import type { Alert } from "@/lib/alerts";

/*
 * The bell in a workspace header.
 *
 * It was a <button> with no handler — it rendered, it took a click, and
 * nothing happened. A control that looks live and is not teaches people that
 * the whole surface might be decoration, which is the one thing an assistant
 * cannot afford.
 *
 * WHAT IT SHOWS. The top few of exactly what /notifications shows, from the
 * same `alertsFor` — so the bell and the page it opens cannot disagree. It is
 * a peek, not a second inbox: no read state, no dismissal, no per-alert
 * actions. Anything you can do about an alert, you do on the alert page.
 *
 * WHEN THERE IS NOTHING it says so, in the words of the thing rather than a
 * cheerful claim: an empty list is a real answer here, and rejected-patterns
 * #15 wants that said plainly rather than dressed up.
 *
 * Every row goes to /notifications. The alerts each carry their own action
 * target — /check-in, /compliance, /advice — but a four-line popover is not
 * where somebody should be dispatched into a workflow they cannot see the
 * context for; the page shows the whole set with the same links on it.
 */

const PRIORITY_TONE = [
  "var(--color-critical)",
  "var(--color-warning)",
  "var(--color-in-progress)",
  "var(--color-neutral)",
];

/** How many fit in a popover before it becomes a page badly drawn. */
const PEEK = 4;

export function AlertBell({ alerts }: { alerts: Alert[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  /*
   * Close on an outside click or Escape — the same contract as the account
   * menu. A popover that only closes by pressing the same button again is a
   * popover people leave open over the content they were trying to read.
   */
  useEffect(() => {
    if (!open) return;

    const onPointer = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = alerts.slice(0, PEEK);
  const count = alerts.length;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          count === 0
            ? "Alerts — nothing waiting"
            : `Alerts — ${count} waiting`
        }
        className="nx-focus-ring relative grid size-11 place-items-center rounded-full border border-white/[0.08] bg-white/[0.04] text-[var(--nx-text-secondary)] transition-colors hover:text-white/90"
      >
        <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
        {/*
          The count, not a bare dot. "Something is waiting" and "four things
          are waiting" are different decisions about whether to look now, and
          the dot makes the reader open the popover to find out which.
        */}
        {count > 0 && (
          <span
            aria-hidden="true"
            className="metric absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full
                       bg-[var(--color-critical)] px-1 text-[10px] font-semibold leading-[18px] text-white"
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Alerts"
          className="glass-overlay absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl p-1.5"
        >
          {shown.length === 0 ? (
            <p className="px-3 py-4 text-sm leading-relaxed text-[var(--nx-text-secondary)]">
              Nothing to report yet.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {shown.map((a) => {
                const tone = PRIORITY_TONE[Math.min(a.priority, 3)];
                return (
                  <li key={a.id}>
                    <Link
                      href="/notifications"
                      onClick={() => setOpen(false)}
                      className="flex gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/[0.06]"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-1 w-0.5 shrink-0 self-stretch rounded-full"
                        style={{ backgroundColor: tone }}
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium leading-snug text-white/90">
                          {a.title}
                        </span>
                        {a.body && (
                          <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-[var(--nx-text-secondary)]">
                            {a.body}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {/*
            Always present, including when the list is empty — otherwise the
            popover is a dead end for precisely the person checking whether
            they have missed something.
          */}
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="mt-1 flex min-h-11 items-center justify-between gap-2 rounded-lg border-t border-white/[0.08] px-2.5 text-[13px] text-[var(--nx-primary-light)] transition-opacity hover:opacity-80"
          >
            {count > shown.length
              ? `See all ${count} alerts`
              : "Open alerts"}
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      )}
    </div>
  );
}
