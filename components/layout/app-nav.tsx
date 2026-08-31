"use client";

import Link from "next/link";
import { NexusMark } from "@/components/ui/nexus-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { usePathname } from "next/navigation";
import { m } from "motion/react";
import {
  Bell,
  Building2,
  Clock,
  History,
  Plug,
  LayoutDashboard,
  Lightbulb,
  ListTodo,
  Mic,
  PenLine,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { springDefault } from "@/lib/motion-tokens";
import { GROUP_LABEL, type IconKey, type Launcher, type NavGroup, type Tab } from "@/lib/nav";

/*
 * Navigation, in three shapes for three devices.
 *
 * GUIDE Corrective Brief: "The current pattern of a centered bottom pill on
 * all devices risks making the desktop app feel like a mobile prototype."
 * That was a fair hit — the pill was rendered at 1440px too.
 *
 *   phone    floating bottom pill, thumb-first
 *   tablet   compact icon rail down the left
 *   desktop  full sidebar with labels and the account beneath
 *
 * All three are rendered and gated by CSS breakpoints rather than measuring
 * the viewport in JavaScript. Measuring means the server cannot know which to
 * emit, so the first paint is either wrong or absent — a flash of the mobile
 * nav on a desktop, on every navigation.
 */

const ICONS: Record<IconKey, LucideIcon> = {
  command: LayoutDashboard,
  units: Building2,
  insights: Lightbulb,
  alerts: Bell,
  myweek: LayoutDashboard,
  tasks: ListTodo,
  checkin: PenLine,
  people: Users,
  admin: SlidersHorizontal,
  org: Settings2,
  shield: ShieldCheck,
  clock: Clock,
  history: History,
  settings: UserCog,
  plug: Plug,
};

/**
 * Tabs in their sections, in declared order, skipping empty groups.
 *
 * Order comes from `tabsFor`, not from this list, so a rail never reorders
 * itself when a capability is added.
 */
const GROUP_ORDER: NavGroup[] = ["personal", "team", "admin", "account"];

function groupTabs(tabs: Tab[]): { group: NavGroup; items: Tab[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    items: tabs.filter((t) => (t.group ?? "personal") === group),
  })).filter((g) => g.items.length > 0);
}

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/* ------------------------------------------------------------------ phone */

export function BottomNav({
  tabs,
  launcher,
}: {
  tabs: Tab[];
  launcher: Launcher | null;
}) {
  const isActive = useActive();

  /*
   * The launcher takes the place of the tab it replaces rather than sitting
   * beside it. Two entry points to the same act, one of them four times the
   * size, is a question the interface should not be asking — and the tab is
   * still in the desktop sidebar, where there is no launcher.
   */
  /*
   * The phone bar carries the PERSONAL group only.
   *
   * Capability-based navigation gave an administrator eleven destinations, and
   * eleven of anything in a 360px pill is a row of unreadable glyphs. The
   * personal group is what somebody reaches for one-handed; Administration is
   * work done sitting down, and it stays in the sidebar and on the
   * Administration home, which lists every one of its pages.
   *
   * A role with no personal group — none exists today, but the shape allows it
   * — falls back to whatever it does have rather than showing an empty bar.
   */
  const personal = tabs.filter((t) => (t.group ?? "personal") === "personal");
  const onPhone = personal.length > 0 ? personal : tabs;

  const shown =
    launcher && launcher.replaces
      ? onPhone.filter((t) => t.href !== launcher.replaces)
      : onPhone;

  /*
   * One slot list, tabs and launcher together, so the sliding indicator can
   * stay percentage-driven.
   *
   * It has to: MotionProvider runs LazyMotion with domAnimation, which
   * excludes layout animations, so layoutId — the obvious way to move a
   * highlight between elements of different widths — is not available here.
   * Equal slots keep the arithmetic honest instead.
   */
  const middle = Math.ceil(shown.length / 2);
  const slots: ({ kind: "tab"; tab: Tab } | { kind: "launch" })[] = [
    ...shown.slice(0, middle).map((tab) => ({ kind: "tab" as const, tab })),
    ...(launcher ? [{ kind: "launch" as const }] : []),
    ...shown.slice(middle).map((tab) => ({ kind: "tab" as const, tab })),
  ];

  const activeIndex = slots.findIndex((s) => s.kind === "tab" && isActive(s.tab.href));
  const widthPct = 100 / slots.length;

  /*
   * Labels collide once a role carries more than four tabs beside the
   * launcher.
   *
   * At 360px six slots is 60px each, where "Overview" and "Reporting" ran into
   * each other. Rather than truncate every label into an unreadable stub, past
   * four the label is painted only for the tab you are on: the icons carry the
   * rest, and the one you need to read is the one that is legible.
   */
  const labelOnlyWhenActive = shown.length > 4;

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),12px)] md:hidden"
    >
      <div className="glass-l2 glass-sheen pointer-events-auto relative flex w-full max-w-md rounded-full p-1.5">
        {activeIndex >= 0 && (
          <m.span
            aria-hidden="true"
            className="absolute inset-y-1.5 left-1.5 rounded-full bg-white/[0.12]"
            style={{ width: `calc(${widthPct}% - 0.375rem)` }}
            animate={{ x: `${activeIndex * 100}%` }}
            transition={springDefault}
          />
        )}

        {slots.map((slot, i) => {
          /*
           * An action, not a destination — so no label, no aria-current, and
           * it never takes the indicator. The circle is 48px, which is the tap
           * target on its own; the link around it fills the slot so the whole
           * column is pressable.
           */
          if (slot.kind === "launch" && launcher) {
            return (
              <Link
                key="launch"
                href={launcher.href}
                aria-label={launcher.label}
                /*
                  Not prefetched. The target is a route the person is
                  usually already standing on, and the ?ask=1 on it is an
                  instruction rather than an address — prefetching it
                  fetches the same page again under a URL that exists only
                  to be acted on and discarded.
                */
                prefetch={false}
                className="relative z-10 flex min-h-11 flex-1 items-center justify-center"
              >
                <span
                  className="grid size-12 place-items-center rounded-full
                             bg-[var(--dept-techspecialist)] text-white
                             shadow-lg shadow-[var(--dept-techspecialist)]/30
                             transition-transform active:scale-95"
                >
                  <Mic size={20} strokeWidth={2} aria-hidden="true" />
                </span>
              </Link>
            );
          }
          if (slot.kind !== "tab") return null;

          const tab = slot.tab;
          const Icon = ICONS[tab.icon];
          const active = i === activeIndex;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative z-10 flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-0.5 py-1.5 transition-colors duration-150",
                active ? "text-white/95" : "text-white/50 hover:text-white/80",
              )}
            >
              <Icon size={19} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
              {/*
                Hidden visually, never removed: a screen reader must not be
                handed six unlabelled icons.
              */}
              <span
                className={cn(
                  "whitespace-nowrap text-2xs font-medium leading-none",
                  labelOnlyWhenActive && !active && "sr-only",
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------- tablet + desktop */

export function SideNav({
  tabs,
  orgName,
  roleLabel,
  aside,
  footer,
}: {
  tabs: Tab[];
  orgName: string;
  roleLabel: string;
  /*
   * One personal thing at the foot of the rail, above the account.
   *
   * Coaching lives here now — see components/myweek/coaching-rail-card.tsx.
   * It is a slot rather than the card itself so the nav keeps knowing only
   * about navigation: it is a client component, and the card needs a
   * server-side read.
   */
  aside?: React.ReactNode;
  footer: React.ReactNode;
}) {
  const isActive = useActive();

  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 hidden h-dvh shrink-0 flex-col border-y-0 border-l-0 md:flex
                 md:w-[76px] lg:w-[244px]"
      /*
        TOKENS, NOT LITERALS.
 
        These were hardcoded, so the rail kept its near-black fill in the white
        theme while its own `text-white/55` re-pointed at ink — black type on a
        black rail, unreadable, and invisible to the sweep because the sweep
        only ever runs the black theme. --nx-sidebar and --nx-border are
        already stated per theme; the rail just has to read them.
      */
      style={{
        backgroundColor: "var(--nx-sidebar)",
        borderRight: "1px solid var(--nx-border)",
      }}
    >
      {/* identity */}
      <div className="flex items-center gap-2.5 px-4 py-4 lg:px-5">
        <NexusMark size={32} />
        <div className="hidden min-w-0 flex-1 lg:block">
          <p className="truncate text-sm font-medium leading-tight">{orgName}</p>
          <p className="truncate text-2xs leading-tight text-tertiary">{roleLabel}</p>
        </div>
        {/*
          At the top, not in the footer.

          It sat beside the account at the foot of the rail, which is where a
          product puts the things somebody uses once — sign out, switch seat.
          The theme is not that: it is the first thing a person reaches for
          when a screen is hard to read, so it belongs where the eye starts.

          Desktop only here, because below `lg` the rail is a 76px icon strip
          or absent entirely. The phone gets it in the header, which is
          already at the top.
        */}
        <div className="hidden lg:block">
          <ThemeToggle />
        </div>
      </div>

      {/*
        Grouped, because a person can now hold more than one kind of work.

        An administrator's rail carries their own week AND the organisation's
        configuration, and eleven undifferentiated rows make those read as one
        undifferentiated job. The personal group is deliberately unlabelled: it
        is not a section somebody navigates to, it is simply where they are.

        On the 76px tablet rail the headings are hidden and a hairline stands
        in for them — a label that would be clipped to two letters is worse
        than a rule.
      */}
      <div className="flex-1 overflow-y-auto px-2 py-2 lg:px-3">
        {groupTabs(tabs).map(({ group, items }) => (
          <section key={group} className="mb-1 last:mb-0">
            {group !== "personal" && (
              <>
                <hr className="mx-2 my-2 border-white/[0.07]" aria-hidden="true" />
                {/*
                  A group with no label still gets its separator. "You" above a
                  single Settings row is a heading longer than its section, and
                  the rule already says everything it would.
                */}
                {GROUP_LABEL[group] && (
                  <h2 className="eyebrow mt-3 hidden px-3 pb-1.5 lg:block">
                    {GROUP_LABEL[group]}
                  </h2>
                )}
              </>
            )}
            <ul className="space-y-1">
              {items.map((tab) => {
                const Icon = ICONS[tab.icon];
                const active = isActive(tab.href);
                return (
                  <li key={tab.href}>
                    <Link
                      href={tab.href}
                      aria-current={active ? "page" : undefined}
                      title={tab.label}
                      className={cn(
                        "relative flex min-h-11 items-center gap-3 rounded-lg px-3 transition-colors",
                        "md:justify-center lg:justify-start",
                        active
                          ? "bg-[var(--nx-primary)]/18 text-[var(--nx-primary-light)] shadow-[inset_0_0_0_1px_rgba(139,92,246,0.35)]"
                          : "text-white/55 hover:bg-white/[0.05] hover:text-white/85",
                      )}
                    >
                      {/*
                        A left edge marker rather than a moving pill: a sidebar
                        item is read as a row, and the eye finds the marked row
                        faster than it tracks a highlight that slid there.
                      */}
                      {active && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--dept-techspecialist)] md:hidden lg:block"
                        />
                      )}
                      <Icon size={18} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
                      <span className="hidden truncate text-sm lg:inline">{tab.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {aside}

      <div className="border-t border-white/[0.07] p-2 lg:p-3">{footer}</div>
    </nav>
  );
}
