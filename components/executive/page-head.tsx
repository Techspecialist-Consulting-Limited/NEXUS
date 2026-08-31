import type { ReactNode } from "react";

/*
 * One header for every executive page.
 *
 * The dashboard establishes a shape — what this is, when it is from, and one
 * sentence of state — and the other pages have to repeat it exactly or the
 * product reads as four products. So it lives here rather than being typed
 * out three times and drifting.
 *
 * `standfirst` is the part that earns its place: a page that opens with a
 * title and then a wall of cards makes the reader do the summarising. One
 * counted sentence at the top answers "is this fine?" before they scroll.
 */
export function PageHead({
  title,
  cycleLabel,
  standfirst,
  aside,
}: {
  title: string;
  /** The week this page is about, or null before one has settled. */
  cycleLabel: string | null;
  /** One line, built from counted facts. Never a generated claim. */
  standfirst: ReactNode;
  /** Optional right-hand marker — a count, a state. */
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 pb-1">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        <p className="standfirst mt-1.5">{standfirst}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {aside}
        {/*
          The week, set as a plain mono label rather than a filled chip.
          It is a coordinate, not a status — a badge would give it the same
          visual weight as something that needs acting on.
        */}
        {/*
          Omitted entirely when there is no week, rather than printed as an
          empty box. A coordinate nobody can read is not a coordinate.
        */}
        {cycleLabel && (
          <span className="metric text-2xs uppercase tracking-wider text-tertiary">
            {cycleLabel}
          </span>
        )}
      </div>
    </div>
  );
}
