import Link from "next/link";
import type { ReactNode } from "react";

/*
 * The frame every Administration page sits in.
 *
 * One title, one sentence saying what this page decides, and the content. It
 * exists so the eight administration pages cannot drift into eight different
 * shapes — which is what happens when each one is laid out by whoever wrote it
 * last.
 *
 * Administration is deliberately plainer than the rest of NEXUS: borders and
 * spacing rather than glass and depth. It is the same product — same type
 * scale, same colours, same tokens — doing a different job. Configuration
 * pages are read carefully and rarely, and clarity beats atmosphere every
 * time.
 */
export function AdminShell({
  title,
  standfirst,
  action,
  children,
}: {
  title: string;
  standfirst: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-4">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          <p className="standfirst mt-1.5">{standfirst}</p>
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}

/**
 * A row of links to the other Administration pages.
 *
 * On a phone the sidebar is not there — the bottom bar carries the personal
 * group only — so without this an administrator could reach Administration and
 * then be stranded on whichever page they landed on.
 */
export function AdminIndex({
  items,
  current,
}: {
  items: { href: string; label: string; blurb: string }[];
  current?: string;
}) {
  return (
    <nav aria-label="Administration">
      <ul className="grid gap-2 sm:grid-cols-2">
        {items
          .filter((i) => i.href !== current)
          .map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex min-h-11 flex-col justify-center rounded-lg border border-white/[0.09]
                           bg-white/[0.02] px-3.5 py-3 transition-colors hover:bg-white/[0.05]"
              >
                <span className="text-sm text-white/90">{item.label}</span>
                <span className="note mt-0.5">{item.blurb}</span>
              </Link>
            </li>
          ))}
      </ul>
    </nav>
  );
}

/** Every Administration page, in the order the setup journey visits them. */
export const ADMIN_PAGES = [
  {
    href: "/admin",
    label: "Organization",
    blurb: "Name, timezone and setup readiness",
  },
  { href: "/admin/people", label: "People", blurb: "Invite, place and set capability" },
  {
    href: "/admin/departments",
    label: "Departments",
    blurb: "Units, leads and members",
  },
  {
    href: "/admin/permissions",
    label: "Permissions",
    blurb: "What each capability allows",
  },
  { href: "/admin/reporting", label: "Reporting", blurb: "When the week opens and closes" },
  {
    href: "/admin/integrations",
    label: "Integrations & security",
    blurb: "What NEXUS is connected to",
  },
  { href: "/admin/audit", label: "Audit log", blurb: "Who changed what, and when" },
];
