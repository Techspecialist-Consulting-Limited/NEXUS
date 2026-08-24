"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, UserRound } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";

/** Who you are, and the way out. Replaces the persona switcher under real auth. */
export function AccountMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  /*
   * Close on an outside click or Escape.
   *
   * A menu that only closes by pressing the same button again is a menu people
   * leave open over the content they were trying to read.
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

  function signOut() {
    startTransition(async () => {
      await supabaseBrowser().auth.signOut();
      router.push("/login");
      router.refresh();
    });
  }

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex min-h-11 items-center gap-2 rounded-lg border border-white/[0.10] bg-white/[0.04] px-2.5 text-sm hover:bg-white/[0.08]"
      >
        <span
          aria-hidden="true"
          className="grid size-6 place-items-center rounded-full bg-[var(--dept-techspecialist)]/25 text-2xs font-medium text-[var(--dept-techspecialist)]"
        >
          {initials || <UserRound size={12} />}
        </span>
        <span className="max-w-[10rem] truncate">{name}</span>
      </button>

      {open && (
        /*
          Direction follows the anchor, which differs by breakpoint.

          This control renders in TWO places from one definition: the sidebar
          footer on desktop, pinned to the bottom of a full-height nav, and the
          mobile header, pinned to the top. Opening upward is right for the
          first and puts the menu off-screen above for the second — which is
          exactly what happened when only the desktop case was considered, and
          sign-out became unreachable on phones.

          Below `md`: open downward from a top-anchored trigger, aligned right
          because the trigger sits at the right edge of the header.
          From `md`: open upward and left, inside a 244px sidebar.
        */
        <div
          role="menu"
          className="glass-overlay absolute right-0 top-full z-50 mt-2 w-56 rounded-lg p-2
                     md:bottom-full md:left-0 md:right-auto md:top-auto md:mb-2 md:mt-0"
        >
          <p className="px-2 pb-2 pt-1 text-2xs leading-snug text-tertiary">
            Signed in as
            <span className="mt-0.5 block truncate text-white/80">{email}</span>
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={pending}
            className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm text-white/80 hover:bg-white/[0.08] disabled:opacity-50"
          >
            <LogOut size={15} aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
