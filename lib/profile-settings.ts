import { asActor } from "./db";
import type { PersonalSettings } from "./settings-vocabulary";

export type { PersonalSettings };

/*
 * A person's own profile and preferences.
 *
 * EVERY CONTROL HERE IS READ BY SOMETHING. That is the bar, and it is why this
 * page is small: quiet hours and the notification switches are read by
 * `enqueue_notification` in migration 0005 before anything is sent, and the
 * timezone decides what "today" means for the daily budget. Nothing on this
 * surface is stored so the settings page has something to show.
 *
 * Reads and writes go through asActor, so `profiles_update_self` — "the row is
 * yours" — is the boundary. It cannot be used to change somebody else's
 * preferences, and the `profiles_guard_role` trigger from 0008 means it cannot
 * be used to change your own role or status either, whatever the request body
 * contains.
 */

type Row = {
  full_name: string;
  email: string;
  title: string | null;
  timezone: string;
  department_name: string | null;
  lead_name: string | null;
  quiet_hours_start: number;
  quiet_hours_end: number;
  notification_prefs: Record<string, unknown>;
  auth_provider: string | null;
  joined_at: string | null;
};

function flag(prefs: Record<string, unknown>, key: string): boolean {
  const v = prefs[key];
  return v === undefined || v === null ? true : Boolean(v);
}

export async function personalSettings(actor: string): Promise<PersonalSettings | null> {
  const rows = await asActor(
    actor,
    (sql) => sql<Row>`
      select p.full_name, p.email, p.title, p.timezone,
             d.name      as department_name,
             l.full_name as lead_name,
             p.quiet_hours_start, p.quiet_hours_end, p.notification_prefs,
             p.auth_provider,
             /*
              * Seeded and imported people predate the membership columns, so
              * joined_at is null for them while created_at is not. "Joined:
              * Unknown" beside somebody who has been reporting for two months
              * is the page admitting it did not look hard enough.
              */
             coalesce(p.joined_at, p.created_at) as joined_at
      from profiles p
      left join departments d on d.id = p.department_id
      left join profiles l on l.id = d.lead_id
      where p.id = ${actor}
    `,
  );
  const r = rows[0];
  if (!r) return null;

  return {
    fullName: r.full_name,
    email: r.email,
    title: r.title,
    timezone: r.timezone,
    departmentName: r.department_name,
    leadName: r.lead_name,
    quietHoursStart: r.quiet_hours_start,
    quietHoursEnd: r.quiet_hours_end,
    notifications: {
      nudges: flag(r.notification_prefs, "nudges"),
      weeklyDigest: flag(r.notification_prefs, "weekly_digest"),
      email: flag(r.notification_prefs, "email"),
      inApp: flag(r.notification_prefs, "in_app"),
    },
    authProvider: r.auth_provider,
    joinedAt: r.joined_at,
  };
}

/**
 * Save what a person may change about themselves.
 *
 * Deliberately narrow. `role`, `status`, `department_id` and `org_id` are NOT
 * in the patch and never will be: those are somebody else's decision, and a
 * settings endpoint that accepted them would be the invitation model defeated
 * by a form post. The trigger in 0008 would refuse anyway — this is the second
 * lock, not the only one.
 */
export async function updatePersonalSettings(
  actor: string,
  patch: {
    fullName?: string;
    title?: string | null;
    timezone?: string;
    quietHoursStart?: number;
    quietHoursEnd?: number;
    notifications?: Partial<PersonalSettings["notifications"]>;
  },
): Promise<boolean> {
  const prefsPatch: Record<string, boolean> = {};
  const n = patch.notifications;
  if (n?.nudges !== undefined) prefsPatch.nudges = n.nudges;
  if (n?.weeklyDigest !== undefined) prefsPatch.weekly_digest = n.weeklyDigest;
  if (n?.email !== undefined) prefsPatch.email = n.email;
  if (n?.inApp !== undefined) prefsPatch.in_app = n.inApp;

  const rows = await asActor(
    actor,
    (sql) => sql<{ id: string }>`
      update profiles
         set full_name         = coalesce(${patch.fullName?.trim() || null}, full_name),
             title             = case when ${patch.title !== undefined}
                                      then ${patch.title?.trim() || null}
                                      else title end,
             timezone          = coalesce(${patch.timezone ?? null}, timezone),
             quiet_hours_start = coalesce(${patch.quietHoursStart ?? null}, quiet_hours_start),
             quiet_hours_end   = coalesce(${patch.quietHoursEnd ?? null}, quiet_hours_end),
             /*
              * Merged, not replaced. The object holds four switches and a form
              * that knows about the three it rendered would silently reset the
              * fourth. ::text::jsonb for the reason migration 0012 documents.
              */
             notification_prefs = notification_prefs || ${JSON.stringify(prefsPatch)}::text::jsonb,
             updated_at        = now()
       where id = ${actor}
      returning id
    `,
  );
  return rows.length > 0;
}
