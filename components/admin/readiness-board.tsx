import Link from "next/link";
import { ArrowRight, Check, CircleDashed } from "lucide-react";
import type { Readiness } from "@/lib/readiness";

/*
 * "Is this organisation configured correctly?"
 *
 * That is the only question an Administration home should answer, and it is
 * why this is a checklist rather than a dashboard. The brief was explicit:
 * no KPI grid, no decorative charts, no staff performance figures without an
 * administrative purpose. An admin arriving here wants to know what is not
 * finished and where to finish it.
 *
 * DELIBERATELY UTILITARIAN. Administration is configuration work. It reuses
 * the NEXUS type scale and colours so it is recognisably the same product,
 * but it does not reach for glass or depth — a settings page that performs is
 * a settings page that is harder to read.
 *
 * The list collapses to a single line once everything is done, rather than
 * living permanently at the top of the screen congratulating somebody.
 */
export function ReadinessBoard({ readiness }: { readiness: Readiness }) {
  const { steps, done, total, ready } = readiness;

  if (ready) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-[var(--color-delivered)]/25 bg-[var(--color-delivered)]/[0.06] px-4 py-3">
        <Check
          size={15}
          className="shrink-0 text-[var(--color-delivered)]"
          aria-hidden="true"
        />
        <p className="text-sm text-white/85">
          Organisation ready. Every setup step is complete.
        </p>
      </div>
    );
  }

  const open = steps.filter((s) => !s.done);

  return (
    <section className="rounded-lg border border-white/[0.09] bg-white/[0.02]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-white/[0.07] px-4 py-3.5">
        <h2 className="text-base font-medium text-white/90">Complete your NEXUS setup</h2>
        {/*
          A count, not a percentage. Every step here is a boolean derived from
          a row count, and dressing seven booleans up as "57%" invites the
          reader to believe a precision that is not there.
        */}
        <p className="metric text-2xs uppercase tracking-wider text-tertiary">
          {done} of {total} done
        </p>
      </div>

      <ul>
        {steps.map((step) => (
          <li
            key={step.key}
            className="flex items-start gap-3 border-b border-white/[0.05] px-4 py-3 last:border-b-0"
          >
            {step.done ? (
              <Check
                size={15}
                className="mt-0.5 shrink-0 text-[var(--color-delivered)]"
                aria-label="Done"
              />
            ) : (
              <CircleDashed
                size={15}
                className="mt-0.5 shrink-0 text-white/30"
                aria-label="Not done"
              />
            )}

            <div className="min-w-0 flex-1">
              <p
                className={
                  step.done ? "text-sm text-white/45" : "text-sm text-white/90"
                }
              >
                {step.label}
              </p>
              {/*
                The reason is shown only while the step is open. Explaining why
                somebody should do a thing they have already done is noise, and
                it is most of the noise on a checklist.
              */}
              {!step.done && <p className="note mt-1 max-w-md">{step.why}</p>}
            </div>

            {step.detail && (
              <span className="metric shrink-0 text-2xs text-tertiary">{step.detail}</span>
            )}

            {!step.done && step.href && (
              <Link
                href={step.href}
                className="-my-2 -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-xs text-[var(--dept-techspecialist)] transition-opacity hover:opacity-80"
              >
                Open <ArrowRight size={12} aria-hidden="true" />
              </Link>
            )}
          </li>
        ))}
      </ul>

      {open.length > 0 && (
        <p className="note border-t border-white/[0.07] px-4 py-3">
          NEXUS works before all of this is done. Each unfinished step narrows
          what it can tell you.
        </p>
      )}
    </section>
  );
}
