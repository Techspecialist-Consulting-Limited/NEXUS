import { redirect } from "next/navigation";
import { CircleCheck, CircleDashed, CircleSlash } from "lucide-react";
import { requireViewer } from "@/lib/session";
import { hasAdministration } from "@/lib/capabilities";
import { authMode } from "@/lib/auth";
import { microsoftConfigured } from "@/lib/auth-providers";
import { asActor, dbMode } from "@/lib/db";
import { AdminShell, AdminIndex, ADMIN_PAGES } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

/*
 * Integrations and security.
 *
 * EVERY LINE ON THIS PAGE IS OBSERVED, NOT CONFIGURED.
 *
 * Whether Microsoft sign-in is offered comes from this server's own
 * environment (see lib/auth-providers.ts), the email sender from whether a
 * key is present, the model tier from whether a deployment is set. Nothing
 * here has a toggle, because none of it is switched on from inside NEXUS —
 * each row is read from the running configuration, not a setting this page
 * could itself change, and a switch that appeared to change it would be
 * lying about where the truth lives.
 *
 * That is also why there is no "reconnect" button. There is no connection
 * NEXUS holds to reconnect; it reads its own configuration each time.
 *
 * IDENTITY MOVED OFF SUPABASE. Passwords and sessions are now this
 * deployment's own — Auth.js against the same Postgres (see auth.ts) — so the
 * old claim that "the identity provider" holds those and NEXUS does not is no
 * longer true, and this page must not imply otherwise. WHAT IS STILL
 * DELIBERATELY ABSENT: device lists, IP history, a password policy, forced
 * sign-out. Nothing here builds a security console beyond what this page
 * already shows — a listing of controls that do nothing is the fastest way
 * to stop being believed on the ones that work.
 */

type ProviderRow = {
  name: string;
  /** true on, false off, null we could not find out. */
  on: boolean | null;
  detail: string;
};

export default async function AdminIntegrationsPage() {
  const { membership } = await requireViewer();
  if (!hasAdministration(membership.role)) redirect("/");

  const [microsoft, signInCounts] = await Promise.all([
    microsoftConfigured(),
    /*
     * How people in THIS organisation actually signed in, counted from their
     * own rows. "Microsoft is enabled" and "fourteen people use it" are
     * different facts, and the second is the one an administrator is deciding
     * anything with.
     */
    asActor(
      membership.profileId,
      (sql) => sql<{ provider: string | null; n: number }>`
        select auth_provider as provider, count(*)::int as n
        from profiles
        where org_id = (select org_id from profiles where id = ${membership.profileId})
          and status = 'active'
        group by auth_provider
        order by n desc
      `,
    ),
  ]);

  const used = new Map(
    signInCounts.map((r) => [(r.provider ?? "credentials").toLowerCase(), r.n]),
  );
  const usedBy = (keys: string[]) =>
    keys.reduce((sum, k) => sum + (used.get(k) ?? 0), 0);

  /*
   * Local and deterministic now — see lib/auth-providers.ts. Whether
   * Microsoft is offered is read from this server's own environment, not
   * asked of an external dashboard, so there is no "could not find out"
   * state left to represent.
   */
  const identityRow = (name: string, on: boolean, keys: string[]): ProviderRow => ({
    name,
    on,
    detail: on
      ? `Enabled. ${usedBy(keys)} people signed in with it.`
      : "Not configured on this deployment.",
  });

  const identity: ProviderRow[] = [
    identityRow("Microsoft", microsoft, ["azure", "entra", "microsoft-entra-id"]),
    identityRow("Email + password", true, ["credentials", "email"]),
  ];

  const services: ProviderRow[] = [
    {
      name: "Database",
      on: dbMode === "remote",
      detail:
        dbMode === "remote"
          ? "Connected to this deployment's own Postgres. Identity, row-level security and every table live here."
          : "Running on the local demo database (PGlite) with seeded people.",
    },
    {
      name: "Azure OpenAI",
      on: Boolean(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY),
      detail:
        process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY
          ? "Writes the coaching, the findings and the Chairman's brief. Never computes a figure."
          : "Not configured. NEXUS is using its deterministic offline provider, which is why the wording is the same every time.",
    },
    {
      name: "Resend",
      on: Boolean(process.env.RESEND_API_KEY),
      detail: process.env.RESEND_API_KEY
        ? "Delivers reminders and the weekly brief."
        : "Not configured. Nothing is emailed; notifications stay in the app.",
    },
    {
      name: "Scheduler",
      on: Boolean(process.env.CRON_SECRET),
      detail: process.env.CRON_SECRET
        ? "A secret is set, so POST /api/cron/tick will run the rhythm. Whether anything is calling it is decided outside NEXUS."
        : "No CRON_SECRET, so the rhythm endpoint refuses every request. Nothing is prompted, chased or briefed.",
    },
  ];

  return (
    <AdminShell
      title="Integrations & security"
      standfirst="What NEXUS is connected to. All of it is read from the live configuration — none of it is set here."
    >
      {authMode() === "dev" && (
        <p className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/[0.07] px-4 py-3 text-sm text-white/85">
          This deployment has no authentication provider and is using demo
          personas. Anybody who can reach it can become anybody.
        </p>
      )}

      <Group
        title="How people sign in"
        blurb="Set in this deployment's own environment, not here. NEXUS offers on the sign-in screen exactly what is configured, so nobody meets a button that cannot work."
        rows={identity}
      />

      <Group
        title="Services"
        blurb="Present or absent, from the environment this server is running with."
        rows={services}
      />

      <section className="rounded-lg border border-white/[0.09] bg-white/[0.02] px-4 py-3.5">
        <h2 className="text-sm font-medium text-white/90">What NEXUS does not hold</h2>
        <p className="body-sm mt-1.5">
          A password is stored as a salted hash, never the password itself —
          nothing typed at sign-in is ever readable back out of the database.
          Sessions are a signed cookie rather than a row NEXUS can look up, so
          there is no list of somebody&rsquo;s active devices, and no way to end
          one specific session before it expires on its own — only to end all
          of them at once, by rotating the deployment&rsquo;s signing secret.
        </p>
        <p className="note mt-2">
          What NEXUS does enforce is who can read what, and that is row-level
          security in the database rather than anything on this page. See
          Permissions.
        </p>
      </section>

      <AdminIndex items={ADMIN_PAGES} current="/admin/integrations" />
    </AdminShell>
  );
}

function Group({
  title,
  blurb,
  rows,
}: {
  title: string;
  blurb: string;
  rows: ProviderRow[];
}) {
  return (
    <section className="rounded-lg border border-white/[0.09] bg-white/[0.02]">
      <div className="border-b border-white/[0.07] px-4 py-3.5">
        <h2 className="text-base font-medium text-white/90">{title}</h2>
        <p className="note mt-1">{blurb}</p>
      </div>
      <ul>
        {rows.map((row) => (
          <li
            key={row.name}
            className="flex items-start gap-3 border-b border-white/[0.05] px-4 py-3 last:border-b-0"
          >
            {row.on === true ? (
              <CircleCheck
                size={15}
                className="mt-0.5 shrink-0 text-[var(--color-delivered)]"
                aria-label="Connected"
              />
            ) : row.on === false ? (
              <CircleSlash
                size={15}
                className="mt-0.5 shrink-0 text-white/30"
                aria-label="Not connected"
              />
            ) : (
              <CircleDashed
                size={15}
                className="mt-0.5 shrink-0 text-white/30"
                aria-label="Unknown"
              />
            )}
            <div className="min-w-0">
              <p className={row.on === true ? "text-sm text-white/90" : "text-sm text-white/55"}>
                {row.name}
              </p>
              <p className="note mt-0.5">{row.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
