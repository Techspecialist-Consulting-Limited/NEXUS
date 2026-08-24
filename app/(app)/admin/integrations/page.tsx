import { redirect } from "next/navigation";
import { CircleCheck, CircleDashed, CircleSlash } from "lucide-react";
import { requireViewer } from "@/lib/session";
import { hasAdministration } from "@/lib/capabilities";
import { authMode } from "@/lib/auth";
import { enabledProviders, hasSupabase } from "@/lib/supabase-env";
import { asActor } from "@/lib/db";
import { AdminShell, AdminIndex, ADMIN_PAGES } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

/*
 * Integrations and security.
 *
 * EVERY LINE ON THIS PAGE IS OBSERVED, NOT CONFIGURED.
 *
 * The sign-in methods come from Supabase's own /auth/v1/settings, the email
 * sender from whether a key is present, the model tier from whether a
 * deployment is set. Nothing here has a toggle, because none of it is switched
 * on from inside NEXUS — identity is a dashboard setting at the provider, and a
 * switch that appeared to change it would be lying about where the truth
 * lives.
 *
 * That is also why there is no "reconnect" button. There is no connection
 * NEXUS holds to reconnect; it reads a provider's configuration each time.
 *
 * WHAT IS DELIBERATELY ABSENT: sessions, device lists, IP history, a password
 * policy, forced sign-out. NEXUS holds none of those — the identity provider
 * does — and a security page listing controls that do nothing is the fastest
 * way to stop being believed on the ones that work.
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

  const [providers, signInCounts] = await Promise.all([
    enabledProviders(),
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
    signInCounts.map((r) => [(r.provider ?? "email").toLowerCase(), r.n]),
  );
  const usedBy = (keys: string[]) =>
    keys.reduce((sum, k) => sum + (used.get(k) ?? 0), 0);

  /*
   * Three states, not two.
   *
   * `enabledProviders()` reports social-off when it could not reach Supabase
   * at all, so rendering that as "Not enabled on this project" states a fact
   * about a dashboard this page never managed to read — and this page's whole
   * contract is that every line on it is observed. Unknown is its own answer.
   */
  const identityRow = (name: string, on: boolean, keys: string[]): ProviderRow =>
    providers.known
      ? {
          name,
          on,
          detail: on
            ? `Enabled. ${usedBy(keys)} people signed in with it.`
            : "Not enabled on this project.",
        }
      : {
          name,
          on: null,
          detail: "Unknown — this project's sign-in settings could not be read.",
        };

  const identity: ProviderRow[] = [
    identityRow("Microsoft", providers.azure, ["azure", "entra", "microsoft"]),
    identityRow("Google", providers.google, ["google"]),
    identityRow("Email link", providers.email, ["email"]),
  ];

  const services: ProviderRow[] = [
    {
      name: "Supabase",
      on: hasSupabase,
      detail: hasSupabase
        ? "Database, row-level security and identity."
        : "Not configured. NEXUS is running on its local demo database.",
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
        blurb={
          providers.known
            ? "Set in your Supabase project, not here. NEXUS offers on the sign-in screen exactly what is enabled, so nobody meets a button that cannot work."
            : "Set in your Supabase project, not here — and NEXUS could not read that configuration on this request. The states below are unknown rather than off, and the sign-in screen is falling back to email only. A 401 from Supabase means the publishable key on this deployment is wrong; the server log names the status."
        }
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
          Passwords, sessions and device history belong to the identity
          provider. NEXUS never sees a password and cannot end somebody&rsquo;s
          session — signing out everywhere is done where the account lives.
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
