import Link from "next/link";
import { Target } from "lucide-react";

/*
 * Coaching, in the sidebar.
 *
 * It used to be the bottom-right quarter of My Week. It moved here so the
 * workspace could give the whole left column to the check-in composer — the
 * input was being squeezed into a card that had two other things to fit — and
 * because coaching is the one thing on that page that is not about this week:
 * it is true wherever you are in the product, which is what the rail is for.
 *
 * DESKTOP ONLY, and that is not a compromise. Below `lg` the rail is either a
 * 76px icon strip or absent, and My Week renders the full card in the stack
 * instead. One idea, two shapes, each sized for the space it has.
 *
 * It reads `latestCoaching` — the cache, never the generator. The rail renders
 * on every page in the product, and a model call in the app shell would be a
 * 20-30 second tax on every navigation.
 */

export function CoachingRailCard({
  title,
  body,
}: {
  title: string | null;
  body: string | null;
}) {
  /*
   * Nothing written yet says so in one line, without drawing a card.
   *
   * A gradient panel containing an apology is the "UI to make a screen look
   * fuller" that CLAUDE.md rules out — but silence would read as a broken
   * feature to somebody who has just been told coaching lives here, so the
   * sentence stays and the box goes.
   */
  if (!title) {
    return (
      <p className="hidden px-3 pb-2 text-2xs leading-relaxed text-tertiary lg:block">
        Coaching appears here once NEXUS has read your week.
      </p>
    );
  }

  return (
    <Link
      href="/advice"
      className="nx-card-gradient-green nx-focus-ring mx-3 mb-3 hidden rounded-xl p-3 transition-opacity hover:opacity-90 lg:block"
    >
      <p className="flex items-center gap-1.5 text-2xs font-semibold text-[var(--nx-success-light)]">
        <Target size={12} aria-hidden="true" />
        Coaching
      </p>
      <p className="mt-1.5 text-[13px] font-semibold leading-snug text-white">
        {title}
      </p>
      {body && (
        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-white/70">
          {body}
        </p>
      )}
    </Link>
  );
}
