"use client";

import { useCallback, useEffect, useRef } from "react";
import { m, AnimatePresence, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { springGentle } from "@/lib/motion-tokens";

/*
 * A modal dialog. The first one in this product, which is why it is a
 * primitive rather than a one-off.
 *
 * WHAT IT OWNS, AND WHY EACH PIECE IS NOT OPTIONAL
 *
 * Focus trap, Escape, scroll lock, focus restored on close, `aria-modal`. A
 * dialog missing any one of these is not a smaller dialog, it is a broken one:
 * a keyboard user tabs out of it into a page they cannot see, or lands back at
 * the top of the document with no idea where they were.
 *
 * The scrim blurs the page rather than only darkening it. That is the point of
 * the surface — the dashboard stays legible as context but stops competing for
 * the eye.
 *
 * MOTION. Entry is from the left, settling centre, on transform and opacity
 * only, with `springGentle` because this is large-area movement
 * (visual-system.md: modal/sheet 200-400ms). Under reduced motion the movement
 * is dropped and only the fade remains — handled globally by
 * `MotionConfig reducedMotion="user"`, and read here as well so callers can
 * branch their own behaviour on it.
 *
 * Sits at z-[9000]: above the nav (z-50), deliberately BELOW the toaster
 * (z-[9999]). A toast reporting a failure has to remain visible over a modal,
 * or the failure is silent.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function Dialog({
  open,
  onClose,
  labelledBy,
  closeLabel = "Close",
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** id of the element naming this dialog, for `aria-labelledby`. */
  labelledBy: string;
  closeLabel?: string;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();

  /*
   * Remember where focus came from BEFORE the panel takes it, and put it back
   * on close. Without this, dismissing the dialog drops a keyboard user at the
   * top of the document.
   */
  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    return () => restoreTo.current?.focus?.();
  }, [open]);

  // Scroll lock. The page behind must not move while a modal is over it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const trap = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;

      const items = Array.from(
        panel.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      // Wrap at both ends, so Tab can never leave the dialog.
      if (event.shiftKey && (active === first || !panel.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", trap, true);
    return () => document.removeEventListener("keydown", trap, true);
  }, [open, trap]);

  // Move focus into the panel once it exists.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const target =
        panel.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.current;
      target?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 sm:p-6">
          {/*
            The scrim. Dismisses on click, and is aria-hidden because the close
            button is the accessible way out — a screen reader announcing a
            clickable backdrop is noise.
          */}
          <m.div
            aria-hidden="true"
            onClick={onClose}
            className="absolute inset-0 bg-[rgba(6,8,14,0.62)] backdrop-blur-[10px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />

          <m.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            tabIndex={-1}
            className="glass-l3 relative flex max-h-[85vh] w-full max-w-[640px] flex-col rounded-2xl border border-white/[0.12] shadow-2xl outline-none"
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: "-40vw" }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: "-30vw" }}
            transition={springGentle}
          >
            {/*
              Pinned, not scrolled with the content. A dismiss control that
              leaves the viewport is unreachable — the account menu shipped
              exactly that bug and made sign-out impossible on desktop.
            */}
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
            >
              <X size={17} aria-hidden="true" />
            </button>

            {children}
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}
