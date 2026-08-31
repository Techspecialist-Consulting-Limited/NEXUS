"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

/*
 * Black or white.
 *
 * The whole theme is one attribute on <html>: `data-theme="white"` switches
 * the palette, and everything else follows from the tokens — see the white
 * theme block at the foot of app/globals.css. There is no second stylesheet
 * and no class to remember to put on a wrapper.
 *
 * WHY THE ATTRIBUTE IS SET BEFORE REACT RUNS.
 *
 * app/layout.tsx carries a tiny blocking script that reads the stored choice
 * and stamps the attribute during head parsing. Without it, every page would
 * paint black, hydrate, and then turn white — a flash on every navigation for
 * anybody who chose white. This component only keeps its own icon in step
 * with what that script already decided.
 *
 * THE DEFAULT IS WHITE, AND DELIBERATELY NOT THE SYSTEM SETTING. A reporting
 * tool that changes colour because the sun went down is a reporting tool
 * people think is broken. The choice is explicit, remembered, and per-browser
 * — and because nothing stored now means white, BOTH choices are written
 * rather than only the non-default one.
 */

type Theme = "black" | "white";

const STORAGE_KEY = "nexus-theme";

/*
 * A two-line store, because the DOM attribute is the state.
 *
 * useSyncExternalStore rather than an effect that calls setState: the server
 * cannot know what is in localStorage, so this value legitimately differs
 * between the server render and the first client render, and bridging that
 * with an effect is both a cascading re-render and what
 * react-hooks/set-state-in-effect exists to stop. lib/voice.ts reads the
 * Speech API the same way, for the same reason.
 */
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "white"
    ? "white"
    : "black";
}

/* On the server there is no document, and the default is black. */
function getServerSnapshot(): Theme {
  return "black";
}

function apply(next: Theme) {
  if (next === "white") {
    document.documentElement.setAttribute("data-theme", "white");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }

  /*
   * Storage can throw — a private window, or a browser set to block site
   * data. Losing the preference is a smaller failure than a toggle that
   * refuses to toggle, so the write is allowed to fail quietly.
   */
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* not fatal */
  }

  for (const fn of listeners) fn();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const white = theme === "white";

  return (
    <button
      type="button"
      onClick={() => apply(white ? "black" : "white")}
      aria-label={white ? "Switch to the black theme" : "Switch to the white theme"}
      title={white ? "Black theme" : "White theme"}
      /*
        size-11, not size-9. GUIDE §11 sets a 44px minimum with no exceptions,
        and scripts/smoke.mjs asserts it — this shipped at 36px and the sweep
        caught it on every route at every breakpoint, which is precisely what
        that check is for.
      */
      className="nx-focus-ring grid size-11 shrink-0 place-items-center rounded-lg border
                 border-white/[0.11] bg-white/[0.04] text-secondary transition-colors
                 hover:bg-white/[0.09] hover:text-primary"
    >
      {/*
        The icon shows the theme you would GET, not the one you are in — a sun
        on the black theme, a moon on the white one. Both labels say it in
        words as well, because an icon alone cannot distinguish "this is what
        you have" from "this is what you would get".
      */}
      {white ? (
        <Moon size={15} strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Sun size={15} strokeWidth={1.75} aria-hidden="true" />
      )}
    </button>
  );
}
