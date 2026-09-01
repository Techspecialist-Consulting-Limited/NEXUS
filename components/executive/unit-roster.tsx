import Link from "next/link";
import { Building2, UserRound } from "lucide-react";
import type { UnitMember, UnitRoster as Roster } from "@/lib/queries";
/*
 * From lib/roles, NOT lib/auth.
 *
 * lib/auth re-exports ROLE_LABEL, and importing it from there drags
 * next/headers and the Postgres driver into the bundle. This component is
 * now rendered inside the Chairman's dashboard, which is a client
 * component, and the build fails outright: "You're importing a module that
 * depends on next/headers". lib/roles is the definition and is pure data.
 */
import { ROLE_LABEL, type OrgRole } from "@/lib/roles";
import { unitTone, unitWash } from "@/lib/unit-tone";

/*
 * The organisation's shape: every unit, and who is in it.
 *
 * WHY THIS EXISTS SEPARATELY FROM UNIT HEALTH.
 *
 * Health answers "how is this unit doing", which can only be answered for a
 * week that has settled. Existence answers "what units are there and who is in
 * them", which is true from the moment somebody creates one. The Units page
 * only ever asked the first question, so a new organisation was told "no
 * settled weeks yet" and shown nothing — the Chairman could not see the units
 * he had just created, nor that nobody had been put in them.
 *
 * UNASSIGNED PEOPLE ARE LISTED, NOT HIDDEN. Somebody in no unit is invisible
 * to every roll-up in the product: they are absent from unit health, from the
 * department digest, and from the Chairman's per-unit reading. That is the
 * single most consequential piece of missing configuration in a new
 * organisation, and it belongs on the screen rather than in a gap between two
 * numbers that do not add up.
 */

export function UnitRoster({
  roster,
  /** Whether to draw the section heading. Off when this is the whole page. */
  heading = true,
  /**
   * Dense: names and headcounts, no member lists.
   *
   * For the Chairman's dashboard, where the question is "what units exist and
   * is anybody in them" rather than "who exactly". Each tile opens the unit,
   * which is where the second question is properly answered.
   */
  dense = false,
}: {
  roster: Roster;
  heading?: boolean;
  dense?: boolean;
}) {
  const { units, unassigned } = roster;
  const placed = units.reduce((n, u) => n + u.members.length, 0);

  return (
    <section aria-label="Units and people">
      {heading && (
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-medium tracking-tight">Units and people</h2>
          <p className="text-xs text-secondary">
            {/*
              Counted, and the two numbers are the same set: everybody active,
              split by whether they are in a unit. A reader can check the
              arithmetic against the rows below, which is the point.
            */}
            {units.length} {units.length === 1 ? "unit" : "units"} · {placed}{" "}
            {placed === 1 ? "person" : "people"} placed
            {unassigned.length > 0 && ` · ${unassigned.length} unassigned`}
          </p>
        </div>
      )}

      {units.length === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-secondary">
          No units yet. Create them in Administration and put people in them —
          until somebody is in a unit, nothing they report can be rolled up to
          one.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {units.map((u) => {
            const inner = (
              <>
                <div className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg"
                    style={{
                      background: unitWash(u.department_id),
                      color: unitTone(u.department_id),
                    }}
                  >
                    <Building2 size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium leading-tight text-white/90">
                      {u.name}
                    </p>
                    <p className="truncate text-xs text-secondary">
                      {u.members.length === 0 ? (
                        "Nobody in it yet"
                      ) : (
                        <span className="metric">
                          {u.members.length}{" "}
                          {u.members.length === 1 ? "person" : "people"}
                        </span>
                      )}
                      {u.lead_name && ` · led by ${u.lead_name}`}
                    </p>
                  </div>
                </div>

                {!dense && u.members.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {u.members.map((m) => (
                      <li key={m.id}>
                        <Person member={m} />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            );

            const shell =
              "block rounded-xl border border-white/[0.13] bg-white/[0.04] p-4";

            /*
              A tile is a link only where it leads somewhere useful. On the
              dashboard it opens the unit; on the Units page the members are
              already listed underneath it, so a link would take somebody to
              what they are looking at.
            */
            return dense ? (
              <Link
                key={u.department_id}
                href={`/departments/${u.department_id}`}
                aria-label={`Open ${u.name}`}
                className={`${shell} transition-colors hover:border-white/[0.22] hover:bg-white/[0.07]`}
              >
                {inner}
              </Link>
            ) : (
              <div key={u.department_id} className={shell}>
                {inner}
              </div>
            );
          })}
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/[0.07] p-4">
          <p className="text-[15px] font-medium text-[var(--color-warning)]">
            {unassigned.length} {unassigned.length === 1 ? "person is" : "people are"}{" "}
            in no unit
          </p>
          {/*
            Said plainly, with the consequence, because the consequence is not
            obvious: an unassigned person still files a check-in and still has
            commitments, and none of it reaches any unit's figures.
          */}
          <p className="mt-1 text-sm leading-relaxed text-white/80">
            What they report is counted for them and for nobody else — it
            reaches no unit&rsquo;s delivery figures and no unit&rsquo;s digest.
            Put them in a unit under People in Administration.
          </p>
          {!dense && (
            <ul className="mt-3 space-y-1.5">
              {unassigned.map((m) => (
                <li key={m.id}>
                  <Person member={m} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Person({ member }: { member: UnitMember }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <UserRound
        size={13}
        aria-hidden="true"
        className="shrink-0 text-[var(--nx-text-muted)]"
      />
      <span className="truncate text-sm text-white/85">{member.full_name}</span>
      <span className="shrink-0 text-xs text-secondary">
        {member.title ?? ROLE_LABEL[member.role as OrgRole] ?? member.role}
      </span>
    </span>
  );
}
