/*
 * The theme preference, named once.
 *
 * A cookie rather than localStorage, because the server has to know: the
 * `data-theme` attribute is rendered into the HTML by app/layout.tsx, which
 * is what makes the light theme paint on the first frame instead of after
 * hydration. localStorage is invisible to the server, and reading it in a
 * blocking <script> is the pattern React 19 now refuses — see the long note
 * in app/layout.tsx for why that route is closed.
 *
 * Shared here rather than exported from the toggle so that a server component
 * naming this cookie does not have to import a "use client" module to do it.
 */
export const THEME_COOKIE = "nexus-theme";

export type Theme = "black" | "white";

/** A year. The preference is per-browser and there is nothing to expire. */
export const THEME_MAX_AGE = 60 * 60 * 24 * 365;
