import type { ReactNode } from "react";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { BottomNav, SideNav } from "@/components/layout/app-nav";
import { PersonaSwitcher } from "@/components/layout/persona-switcher";
import { AccountMenu } from "@/components/layout/account-menu";
import { CoachingRailCard } from "@/components/myweek/coaching-rail-card";
import { requireViewer, demoPersonas } from "@/lib/session";
import { assertProviderIsSafe, authMode, ROLE_LABEL } from "@/lib/auth";
import { launcherFor, tabsFor } from "@/lib/nav";
import { hasAdministration, hasPersonalWorkspace } from "@/lib/capabilities";
import { latestCoaching } from "@/lib/queries";

/*
 * The authenticated shell.
 *
 * GUIDE Corrective Brief: "Desktop executive views should feel like a command
 * room, not a centered phone column." So the shell is a two-column grid from
 * `md` up — a rail on tablet, a full sidebar on desktop — and only phones get
 * the floating bottom pill.
 *
 * A server component: identity resolves once, then plain props go to the
 * client leaves that need interactivity (GUIDE §2 — client components are
 * leaves, never layouts).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // Fail loudly rather than serve the persona shim to real users.
  assertProviderIsSafe();

  const { identity, membership } = await requireViewer();
  const tabs = tabsFor(membership.role);
  const launcher = launcherFor(membership.role);
  const canAdminister = hasAdministration(membership.role);
  const isDev = authMode() === "dev";
  const personas = isDev ? await demoPersonas() : [];

  const account = isDev ? (
    <PersonaSwitcher people={personas} currentId={membership.profileId} />
  ) : (
    <AccountMenu name={membership.fullName} email={identity.email} />
  );

  /*
   * Coaching moved out of My Week and into the rail, so it is read here.
   *
   * Only for people who have a week — the Chairman consumes digests and files
   * nothing, and coaching about a week he does not report is coaching about
   * nothing. `latestCoaching` reads the cache and never calls a model: this
   * runs on every page in the product.
   */
  const actor = membership.profileId; // what currentActorId() resolves to.
  const coaching = hasPersonalWorkspace(membership.role)
    ? await latestCoaching(actor, membership.profileId)
    : [];
  const tip = coaching[1] ?? coaching[0] ?? null;

  return (
    <div className="relative flex min-h-dvh">
      <a href="#main" className="skip-link text-sm">
        Skip to content
      </a>

      <SideNav
        tabs={tabs}
        orgName={membership.orgName}
        roleLabel={ROLE_LABEL[membership.role]}
        aside={
          hasPersonalWorkspace(membership.role) ? (
            <CoachingRailCard
              title={tip?.title ?? null}
              body={tip?.body ?? null}
            />
          ) : null
        }
        footer={account}
      />

      {/*
        The main area's ground.

        A pale lavender field, painted from the colours the artwork was made
        of — see --lit-field at the foot of app/globals.css. It replaces the
        1.1MB PNG that was here: same look, nothing to download, and it scales
        to any viewport rather than being stretched from 1692x930.

        It is painted by `.surface-lit` itself, and fixed to the viewport so a
        long Tasks list scrolls over the ground rather than dragging it.

        ON THE COLUMN, NOT ON A LAYER BEHIND IT. This was first written as a
        `fixed inset-0 -z-10` child and never appeared: a negative-z-index
        child paints at step 2 of its stacking context, but a non-positioned
        element's own background paints at step 3 — so `body`, which carries an
        opaque var(--nx-bg), covered it. Normally body's background would be
        propagated to the canvas and the problem would not exist, but
        propagation only happens when html has no background of its own, and
        globals.css gives html one. On this element it paints after body's,
        with no z-index at all, and it is inset from the rail for free because
        the column begins where the rail ends.

        `surface-lit` is what makes white type on a pale ground work. It
        restates one variable, --color-white, as ink; Tailwind v4 compiles
        every text-white/*, bg-white/* and border-white/* through it, so the
        ~720 of them across 65 files turn over at once and keep what each
        opacity meant.

        THE CARDS ARE NOT TOUCHED. Anything wearing a card class is a dark
        island on the lit page and restores the dark palette for its own
        subtree. The rail is outside this element and keeps its opaque #0B1020.
      */}
      <div className="surface-lit flex min-w-0 flex-1 flex-col">
        {/* Phones have no sidebar, so identity and the account live up here. */}
        {/*
          Phones have no sidebar, so identity and the account live up here — and
          for anybody with administration capability this is also the ONLY way
          into Administration on a phone. The bottom bar carries the personal
          group alone, because eleven destinations in a 360px pill is a row of
          unreadable glyphs.

          Tapping your own organisation to configure it is the right gesture, so
          the identity block becomes a link rather than gaining a second control
          beside it.
        */}
        <header className="glass-l2 safe-top sticky top-0 z-40 flex items-center justify-between gap-3 border-x-0 border-t-0 px-4 py-2.5 md:hidden">
          {canAdminister ? (
            <Link
              href="/admin"
              className="-my-1 flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1
                         transition-colors hover:bg-white/[0.05]"
            >
              <OrgIdentity
                orgName={membership.orgName}
                roleLabel={ROLE_LABEL[membership.role]}
              />
              <Settings2 size={14} className="shrink-0 text-white/40" aria-hidden="true" />
              <span className="sr-only">Open Administration</span>
            </Link>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <OrgIdentity
                orgName={membership.orgName}
                roleLabel={ROLE_LABEL[membership.role]}
              />
            </div>
          )}
          {account}
        </header>

        <main
          id="main"
          className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-28 pt-4 md:px-6 md:pb-8 lg:px-8"
        >
          {children}
        </main>
      </div>

      <BottomNav tabs={tabs} launcher={launcher} />
    </div>
  );
}

/*
 * The organisation mark and who you are in it. One definition, used by both
 * branches of the header above, so a link and a non-link cannot drift into
 * looking like two different things.
 */
function OrgIdentity({ orgName, roleLabel }: { orgName: string; roleLabel: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--dept-techspecialist)]/20 text-2xs font-semibold text-[var(--dept-techspecialist)]"
      >
        N
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium leading-tight">{orgName}</p>
        <p className="truncate text-2xs leading-tight text-tertiary">{roleLabel}</p>
      </div>
    </>
  );
}
