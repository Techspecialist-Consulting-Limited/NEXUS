import { asActor } from "./db";
import { DEFAULT_WORKING_DAYS, type OrganizationProfile } from "./org-vocabulary";

export type { OrganizationProfile };

/*
 * The organisation's own profile.
 *
 * Reads and writes go through asActor, so the `organizations` policies decide
 * who may see and change this — not a role check in a React component. An
 * administrator editing their own organisation is an ordinary authorised
 * update; anybody else's attempt writes nothing and returns no row.
 *
 * WHAT IS STORED WHERE, AND WHY IT IS NOT ALL COLUMNS
 *
 * `name` and `timezone` are columns because the whole product reads them —
 * cycle generation, digests, quiet hours. Industry, country and working days
 * are held in the existing `settings` jsonb, which 0001 created for exactly
 * this: "tunables the product reads at runtime rather than hardcoding". They
 * are descriptive rather than load-bearing, and adding three columns for three
 * strings nothing joins on is how a schema starts drifting.
 */

type Row = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  settings: Record<string, unknown>;
  onboarding_complete: boolean;
};

function readWorkingDays(settings: Record<string, unknown>): number[] {
  const raw = settings.working_days;
  if (!Array.isArray(raw)) return DEFAULT_WORKING_DAYS;
  const days = raw
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  return days.length > 0 ? [...new Set(days)].sort() : DEFAULT_WORKING_DAYS;
}

export async function organizationProfile(
  actor: string,
): Promise<OrganizationProfile | null> {
  const rows = await asActor(
    actor,
    (sql) => sql<Row>`
      select id, name, slug, timezone, settings, onboarding_complete
      from organizations
      where id = (select org_id from profiles where id = ${actor})
    `,
  );
  const r = rows[0];
  if (!r) return null;

  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    timezone: r.timezone,
    industry: (r.settings.industry as string) ?? null,
    country: (r.settings.country as string) ?? null,
    workingDays: readWorkingDays(r.settings),
    onboardingComplete: r.onboarding_complete,
  };
}

/**
 * Update the organisation profile.
 *
 * `settings` is merged rather than replaced. It holds the notification budget,
 * the digest hour and the review window alongside these three fields, and
 * writing the whole object back from a form that knows about three of them
 * would silently reset the rest.
 *
 * Returns false when RLS refused the write, which is the only signal the
 * caller needs: the row is unchanged either way.
 */
export async function updateOrganizationProfile(
  actor: string,
  patch: {
    name?: string;
    timezone?: string;
    industry?: string | null;
    country?: string | null;
    workingDays?: number[];
  },
): Promise<boolean> {
  const settingsPatch: Record<string, unknown> = {};
  if (patch.industry !== undefined) settingsPatch.industry = patch.industry;
  if (patch.country !== undefined) settingsPatch.country = patch.country;
  if (patch.workingDays !== undefined) {
    settingsPatch.working_days = [...new Set(patch.workingDays)].sort();
  }

  const rows = await asActor(
    actor,
    (sql) => sql<{ id: string }>`
      update organizations
         set name       = coalesce(${patch.name ?? null}, name),
             timezone   = coalesce(${patch.timezone ?? null}, timezone),
             /*
              * ::text::jsonb, not ::jsonb. postgres.js sends a JSON string
              * where PGlite sends an object, and a bare ::jsonb cast stores a
              * double-encoded string on one of them and an object on the
              * other — a bug that passes every test and is only wrong in
              * production. See migration 0012.
              */
             settings   = settings || ${JSON.stringify(settingsPatch)}::text::jsonb,
             updated_at = now()
       where id = (select org_id from profiles where id = ${actor})
      returning id
    `,
  );
  return rows.length > 0;
}
