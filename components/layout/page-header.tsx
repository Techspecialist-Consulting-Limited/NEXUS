import { AlertBell } from "@/components/layout/alert-bell";
import type { Alert } from "@/lib/alerts";

/*
 * The one header, on every page.
 *
 * It used to be built inside My Week and Tasks and nowhere else, so the bell
 * and your own avatar simply did not exist on Settings, Coaching, Alerts or
 * Check-in — the two screens that had chrome had it because somebody happened
 * to write it there twice.
 *
 * NO GREETING. "Good morning, Mike" is a fact about the time of day, and above
 * Settings it is filler in the position the page's own name should occupy. The
 * greeting stays on the home page, where arriving is the event it marks.
 *
 * STICKY, NOT FIXED. `fixed` takes the bar out of flow and puts it over the
 * top of content — which is exactly the overlap that removing the viewport
 * cage from the workspaces was meant to end. Sticky keeps it in the column, so
 * the page below it scrolls under a bar that still holds its own space.
 *
 * Desktop only. Phones already have their own header in the shell carrying the
 * organisation, the theme toggle and the account, and a second bar under it
 * would spend a fifth of a 360px screen on chrome.
 */
export function PageHeader({
  name,
  alerts,
}: {
  name: string;
  alerts: Alert[];
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <header
      className="sticky top-0 z-30 -mx-4 mb-1 hidden items-center justify-end gap-2
                 border-b border-[var(--nx-border)] px-4 py-2
                 md:-mx-6 md:flex md:px-6 lg:-mx-8 lg:px-8"
      style={{ background: "var(--nx-bg)" }}
    >
      <AlertBell alerts={alerts} />

      <span
        title={name}
        aria-label={`Signed in as ${name}`}
        className="grid size-11 shrink-0 place-items-center rounded-full
                   bg-[var(--nx-primary)]/20 text-sm font-semibold
                   text-[var(--nx-primary-light)] ring-1 ring-[var(--nx-border-strong)]"
      >
        {initial}
      </span>
    </header>
  );
}
