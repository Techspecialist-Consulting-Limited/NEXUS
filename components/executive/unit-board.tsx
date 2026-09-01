import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHead } from "@/components/executive/page-head";
import { weekLabel } from "@/lib/cycle";
import type { DepartmentHealth } from "@/lib/queries";
import { unitTone } from "@/lib/unit-tone";

/*
 * Units, in one view.
 *
 * The whole organisation on one screen, ordered so the units that need a
 * conversation are at the top. Everything else — rosters, critical paths,
 * per-person detail — is one click into the unit, because putting it here
 * would make the page a report rather than a decision.
 *
 * ORDER IS THE ARGUMENT. Alphabetical would be neutral and useless; ranking by
 * delivery alone would put a unit that told us it was blocked below one that
 * went silent, which is exactly backwards. So the sort is: unreported first,
 * then silent drops, then delivery. That ordering is the page's entire opinion.
 *
 * GUIDE "Manager UX: Support, Not Policing" — this is a list of where to help,
 * and it is worded that way. No rank numbers, no league table.
 */

function tone(rate: number | null): string {
  if (rate === null) return "var(--color-neutral)";
  if (rate >= 75) return "var(--color-healthy)";
  if (rate >= 55) return "var(--color-warning)";
  return "var(--color-critical)";
}

/** What this unit most needs said about it, in one clause. */
function state(d: DepartmentHealth): { text: string; urgent: boolean } {
  const missing = d.people_reporting - d.people_responded;
  if (d.people_reporting === 0) return { text: "Nobody assigned", urgent: false };
  if (missing > 0) {
    return {
      text: `${missing} ${missing === 1 ? "person has" : "people have"} not reported`,
      urgent: true,
    };
  }
  if (d.silent_drop_count > 0) {
    return {
      text: `${d.silent_drop_count} dropped without saying so`,
      urgent: true,
    };
  }
  if (d.protected_count > 0) {
    return {
      text: `${d.protected_count} blocked by another team`,
      urgent: false,
    };
  }
  if (d.unplanned_count > 0) {
    return { text: `${d.unplanned_count} unplanned this week`, urgent: false };
  }
  return { text: "Everything reported and accounted for", urgent: false };
}

export function UnitBoard({
  cycleLabel,
  departments,
}: {
  cycleLabel: string;
  departments: DepartmentHealth[];
}) {
  const ranked = [...departments].sort((a, b) => {
    const missing = (d: DepartmentHealth) => d.people_reporting - d.people_responded;
    if (missing(a) !== missing(b)) return missing(b) - missing(a);
    if (a.silent_drop_count !== b.silent_drop_count) {
      return b.silent_drop_count - a.silent_drop_count;
    }
    return (a.delivery_rate ?? 101) - (b.delivery_rate ?? 101);
  });

  const reporting = departments.filter((d) => d.delivery_rate !== null);
  const mean = reporting.length
    ? Math.round(
        reporting.reduce((s, d) => s + (d.delivery_rate ?? 0), 0) / reporting.length,
      )
    : null;
  const waiting = departments.reduce(
    (s, d) => s + (d.people_reporting - d.people_responded),
    0,
  );
  const protectedTotal = departments.reduce((s, d) => s + d.protected_count, 0);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 pb-2">
      <PageHead
        title="Units"
        cycleLabel={weekLabel(cycleLabel)}
        standfirst={
          mean === null ? (
            "No unit has a settled week yet."
          ) : (
            <>
              {departments.length} units, delivering {mean}% on average.{" "}
              {waiting > 0
                ? `${waiting} ${waiting === 1 ? "person has" : "people have"} not reported.`
                : "Everyone reported."}
            </>
          )
        }
      />

      <GlassCard level={2} className="p-2 md:p-3">
        <ul className="flex flex-col">
          {ranked.map((d, i) => {
            const s = state(d);
            const bar = d.delivery_rate ?? 0;

            return (
              <li key={d.department_id}>
                <Link
                  href={`/departments/${d.department_id}`}
                  className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2
                             rounded-xl px-3 py-3.5 transition-colors hover:bg-white/[0.05]
                             md:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] md:gap-x-5"
                  style={{
                    borderTop: i === 0 ? undefined : "1px solid var(--nx-border)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: unitTone(d.department_id) }}
                  />

                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white/90">
                      {d.department_name}
                    </p>
                    <p
                      className="truncate text-xs"
                      style={{ color: s.urgent ? "var(--color-warning)" : undefined }}
                    >
                      <span className={s.urgent ? "" : "text-tertiary"}>{s.text}</span>
                    </p>
                  </div>

                  {/*
                    Its own row on a phone, so a unit name never competes with a
                    chart for 200 pixels. Capped on desktop: filling a 1fr
                    column ran it to 330px, which reads as a chart rather than a
                    comparison and makes four points between two units look like
                    a chasm. The figure is written beside it either way — the bar
                    is for comparing rows, never the only place a number lives.
                  */}
                  <div className="col-span-3 md:col-span-1 md:col-start-3 md:max-w-[240px]">
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.08]"
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${bar}%`, background: tone(d.delivery_rate) }}
                        />
                      </span>
                      <span
                        className="metric w-11 shrink-0 text-right text-sm"
                        style={{ color: tone(d.delivery_rate) }}
                      >
                        {d.delivery_rate === null ? "—" : `${Math.round(d.delivery_rate)}%`}
                      </span>
                    </div>
                  </div>

                  <div className="hidden shrink-0 text-right md:block">
                    <p className="metric text-sm text-white/80">
                      {d.people_responded}/{d.people_reporting}
                    </p>
                    <p className="text-2xs text-tertiary">reported</p>
                  </div>

                  <ArrowRight
                    size={15}
                    aria-hidden="true"
                    className="hidden shrink-0 text-white/20 transition-colors
                               group-hover:text-white/70 md:block"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </GlassCard>

      {/*
        Stated once, at the bottom, because it changes how every number above
        is read. A unit blocked by another team is not underperforming, and an
        executive who does not know the rule reads the same figure as a
        judgement on the wrong people.
      */}
      {protectedTotal > 0 && (
        <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-tertiary">
          <ShieldCheck
            size={14}
            className="mt-px shrink-0 text-[var(--color-healthy)]"
            aria-hidden="true"
          />
          <span>
            {protectedTotal} {protectedTotal === 1 ? "commitment is" : "commitments are"}{" "}
            blocked by another team and excluded from these delivery figures. Work held
            up elsewhere is not counted against the people waiting on it.
          </span>
        </p>
      )}
    </div>
  );
}
