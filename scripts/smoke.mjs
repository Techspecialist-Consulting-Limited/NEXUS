/**
 * Browser smoke test.
 *
 * Written after a `LazyMotion strict` violation shipped past a green build, a
 * clean typecheck, and a server-side HTML check — because it only throws
 * during client render. Fetching HTML proves the server did its job; it proves
 * nothing about whether the page works in front of a person.
 *
 * For every route, every role and every breakpoint this:
 *   - loads the page in Chromium
 *   - fails on any console error, page exception or failed request
 *   - scrolls the page so IntersectionObserver reveals actually fire, then
 *     fails on anything still transparent
 *   - fails on horizontal overflow at any width (GUIDE §11)
 *   - fails on text overflowing its container (GUIDE final checklist)
 *   - fails on interactive targets under 44px (GUIDE §11)
 *   - screenshots the result
 *
 * Usage:  node scripts/smoke.mjs [baseUrl]
 */

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = join(process.cwd(), ".smoke");

/**
 * Seeded personas. Each role sees a different product, so each walks its own
 * routes rather than a shared list.
 */
/*
 * Every route in each role's navigation, plus the ones they can reach from it.
 *
 * The list drifted from lib/nav.ts and the drift was invisible: HR gained a
 * personal side and leads gained /my-team, and neither was swept — so the two
 * newest surfaces in the product were the two nothing looked at. If you change
 * tabsFor(), change this.
 */
const ROLES = [
  {
    name: "chairman",
    email: "exec@nexus.demo",
    routes: ["/dashboard", "/departments", "/advice", "/notifications", "/settings"],
  },
  {
    name: "admin",
    email: "admin@nexus.demo",
    /*
     * The Administrator is a staff member with capability on top, so their
     * sweep covers both halves: their own week AND every Administration page.
     * Before this they had no personal routes at all — the first thing an
     * admin saw on a new organisation was a command view saying "no settled
     * weeks yet" and offering nothing else, and no sweep could have caught it
     * because no sweep ever loaded the page they actually land on.
     */
    routes: [
      "/my-week",
      "/commitments",
      "/check-in",
      "/advice",
      "/notifications",
      "/admin",
      "/admin/people",
      "/admin/departments",
      "/admin/permissions",
      "/admin/reporting",
      "/admin/integrations",
      "/admin/audit",
      "/settings",
      "/dashboard",
      "/departments",
    ],
  },
  {
    name: "hr",
    email: "hr@nexus.demo",
    // HR both monitors and reports, so both halves are walked.
    routes: [
      "/dashboard",
      "/compliance",
      "/my-week",
      "/check-in",
      "/departments",
      "/notifications",
      "/settings",
    ],
  },
  {
    name: "lead",
    email: "amara@nexus.demo",
    routes: [
      "/my-week",
      "/my-team",
      "/commitments",
      "/check-in",
      "/advice",
      "/notifications",
      "/settings",
    ],
  },
  {
    name: "staff",
    email: "chidi@nexus.demo",
    routes: ["/my-week", "/commitments", "/check-in", "/advice", "/notifications", "/settings"],
  },
];

/** Before you have signed in at all. */
const SIGNED_OUT_ROUTES = ["/login"];

/*
 * Signed in, member of nothing. /onboarding only renders for this state, so
 * without it that screen cannot be exercised — which is exactly how it went
 * unverified while the suite reported green.
 */
const STRANGER_ROUTES = ["/onboarding"];

/*
 * Three widths, chosen for what breaks at each: 360 is the guide's mobile
 * floor, 768 is where two-column grids first engage and things most often
 * collide, and 1440 is the desktop the Chairman actually uses.
 */
const VIEWPORTS = [
  { label: "mobile", width: 360, height: 800 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "desktop", width: 1440, height: 900 },
];

/** Noise that is not the app's fault and would only train us to ignore output. */
const IGNORE = [
  /favicon/i,
  /Download the React DevTools/i,
  /webpack-hmr|hot-update|__nextjs/i,
];

const ignorable = (text) => IGNORE.some((re) => re.test(text));

async function personaId(page, email) {
  // The persona <select> renders on every authenticated page, so ids come from
  // the DOM rather than from fighting the dev server for the PGlite lock.
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const options = await page.$$eval("select option", (nodes) =>
    nodes.map((n) => ({ value: n.value, label: n.textContent ?? "" })),
  );
  const wanted = email.split("@")[0].toLowerCase();
  return (options.find((o) => o.label.toLowerCase().includes(wanted)) ?? options[0])?.value;
}

/** Everything that can go wrong on one page at one width. */
async function inspect(page) {
  const problems = [];

  // Let hydration and entrance animations settle.
  await page.waitForTimeout(600);

  /*
   * Scroll the whole page before judging it. Sections wrapped in <Reveal>
   * start at opacity 0 and animate in on IntersectionObserver, so without this
   * every below-the-fold section reads as blank — and, more usefully,
   * anything still transparent after a full scroll is genuinely broken.
   */
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 110));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 320));
  });

  const found = await page.evaluate(() => {
    const out = { hidden: [], overflow: 0, clipped: [], small: [], glassDead: false };

    out.overflow =
      document.documentElement.scrollWidth - document.documentElement.clientWidth;

    for (const el of document.querySelectorAll("section, li, figure, h1, h2, p")) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const s = getComputedStyle(el);
      if (parseFloat(s.opacity) < 0.05 || s.visibility === "hidden") {
        out.hidden.push((el.textContent ?? "").trim().slice(0, 50));
      }
    }

    /*
     * Text escaping its box. Skipped where the element is allowed to scroll,
     * since a deliberately scrollable region is not a defect.
     */
    for (const el of document.querySelectorAll("p, h1, h2, h3, span, button, a, td, th")) {
      const s = getComputedStyle(el);
      if (s.overflow !== "visible" || s.display === "none") continue;
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
        const text = (el.textContent ?? "").trim().slice(0, 40);
        if (text) out.clipped.push(`${text} (${el.scrollWidth}>${el.clientWidth})`);
      }
    }

    // GUIDE §11: 44px minimum touch target, no exceptions.
    for (const el of document.querySelectorAll(
      "button, a[href], select, input, [role='menuitem']",
    )) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue; // not rendered
      if (getComputedStyle(el).display === "contents") continue;
      if (r.height < 43.5) {
        const text = (el.textContent ?? el.getAttribute("aria-label") ?? "")
          .trim()
          .slice(0, 30);
        out.small.push(`${el.tagName.toLowerCase()} "${text}" ${Math.round(r.height)}px`);
      }
    }

    /*
     * The glass is actually glass.
     *
     * Lightning CSS once collapsed the backdrop-filter pair down to the
     * -webkit- alias alone, and a browser given only the prefixed form computes
     * `none`. Every surface in the product rendered flat, in every browser,
     * with no error — invisible to typecheck, lint, tests and code review,
     * because the source was correct the whole time.
     *
     * Checked here because a rendered computed style is the only place the
     * truth shows up.
     */
    const glass = document.querySelector(
      ".glass-l1, .glass-l2, .glass-l3, .glass-l4",
    );
    if (glass) {
      const bf = getComputedStyle(glass).backdropFilter;
      if (!bf || bf === "none") out.glassDead = true;
    }

    /*
     * Is the custom type step actually a utility?
     *
     * `--text-2xs` is the one step in the scale Tailwind does not ship, and a
     * :root declaration alone does not create the class — it has to be visible
     * inside @theme. It was not, so `text-2xs` compiled to no rule whatsoever:
     * 111 usages across 32 files silently inherited their parent's size, and
     * the bottom navigation drew 16px labels inside a pill built for 11.
     *
     * Nothing errors when a utility is missing. The class is simply absent, so
     * the only place this shows up is a measured font-size.
     */
    const tiny = document.querySelector(".text-2xs");
    if (tiny) {
      const px = parseFloat(getComputedStyle(tiny).fontSize);
      if (!(px > 0) || px > 12) out.typeScaleDead = Math.round(px * 100) / 100;
    }

    return out;
  });

  if (found.typeScaleDead) {
    problems.push(
      `.text-2xs computes ${found.typeScaleDead}px — the utility is missing ` +
        "from the built CSS (see app/globals.css, @theme inline)",
    );
  }

  if (found.glassDead) {
    problems.push(
      "glass surfaces compute backdrop-filter: none — the standard property " +
        "was dropped from the built CSS (see app/globals.css, ORDER MATTERS)",
    );
  }

  for (const h of [...new Set(found.hidden)].slice(0, 3)) {
    problems.push(`invisible after scroll: "${h}"`);
  }
  if (found.overflow > 1) {
    problems.push(`horizontal overflow: ${found.overflow}px`);
  }
  for (const c of [...new Set(found.clipped)].slice(0, 3)) {
    problems.push(`text clipped: ${c}`);
  }
  for (const t of [...new Set(found.small)].slice(0, 3)) {
    problems.push(`touch target under 44px: ${t}`);
  }

  return problems;
}

function watch(page, problems) {
  page.removeAllListeners("console");
  page.removeAllListeners("pageerror");
  page.removeAllListeners("requestfailed");

  page.on("console", (msg) => {
    if (msg.type() === "error" && !ignorable(msg.text())) {
      problems.push(`console: ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    if (!ignorable(err.message)) problems.push(`exception: ${err.message}`);
  });
  page.on("requestfailed", (req) => {
    const url = req.url();
    const reason = req.failure()?.errorText ?? "";

    /*
     * Next prefetches every link in the nav as an RSC payload. Navigating
     * away cancels whichever are still in flight, which surfaces as
     * ERR_ABORTED — expected, and by definition never seen by a user.
     *
     * Narrowed to prefetches on purpose: an aborted request that is NOT a
     * prefetch still counts, so a genuinely cancelled page load is not
     * quietly swallowed along with them.
     */
    const abortedPrefetch = url.includes("?_rsc=") && reason.includes("ERR_ABORTED");

    if (!ignorable(url) && !abortedPrefetch) {
      problems.push(`request failed: ${url} (${reason})`);
    }
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });

  /*
   * Warm the server before the browser touches it.
   *
   * On a cold checkout the first request boots PGlite, replays every migration
   * and applies the seed — comfortably past Playwright's 30s navigation
   * default, which then reports as a timeout rather than as the one-off setup
   * cost it actually is.
   */
  process.stdout.write("warming the server... ");
  const started = Date.now();
  const warm = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(300_000) });
  console.log(`${warm.status} in ${Math.round((Date.now() - started) / 1000)}s
`);

  const browser = await chromium.launch();
  const failures = [];
  const report = [];

  async function walk(page, label, routes) {
    for (const route of routes) {
      for (const vp of VIEWPORTS) {
        const problems = [];
        watch(page, problems);

        await page.setViewportSize({ width: vp.width, height: vp.height });
        const res = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
        if (!res || res.status() >= 400) problems.push(`http ${res?.status()}`);

        /*
         * Confirm we are actually on the page we asked for.
         *
         * Without this the suite grades whatever it was handed. A build that
         * redirects every route to /login passes every check — no console
         * errors, no overflow, no clipped text — and reports "all routes
         * clean" while testing a login wall. That happened, and it is the
         * most dangerous kind of green.
         */
        const landed = new URL(page.url()).pathname;
        if (landed !== route && !route.startsWith(landed)) {
          problems.push(`redirected to ${landed} instead of ${route}`);
        }

        problems.push(...(await inspect(page)));

        const shot = `${label}${route.replace(/\//g, "_")}.${vp.label}.png`;
        await page.screenshot({ path: join(OUT, shot), fullPage: true });

        const line = `${problems.length ? "FAIL" : "ok  "}  ${label.padEnd(10)} ${route.padEnd(15)} ${vp.label.padEnd(8)} ${shot}`;
        report.push(line);
        console.log(line);
        for (const p of problems) {
          console.log(`        ${p}`);
          failures.push(`${label} ${route} @${vp.label}: ${p}`);
        }
      }
    }
  }

  // ---- signed out ------------------------------------------------------
  {
    const context = await browser.newContext({ viewport: VIEWPORTS[2] });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(90_000);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.request.post(`${BASE}/api/persona`, { data: { signOut: true } });
    await walk(page, "signedout", SIGNED_OUT_ROUTES);
    await context.close();
  }

  // ---- signed in, no organisation --------------------------------------
  {
    const context = await browser.newContext({ viewport: VIEWPORTS[2] });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(90_000);
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.request.post(`${BASE}/api/persona`, { data: { stranger: true } });
    await walk(page, "stranger", STRANGER_ROUTES);
    await context.close();
  }

  // ---- each role -------------------------------------------------------
  for (const role of ROLES) {
    const context = await browser.newContext({ viewport: VIEWPORTS[2] });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(90_000);
    const id = await personaId(page, role.email);
    await page.request.post(`${BASE}/api/persona`, { data: { profileId: id } });

    /*
     * The unit drill-down needs a real id, so it is discovered rather than
     * hardcoded — a fixture id would rot the first time the seed changed, and
     * this is the one screen a stale route would silently stop covering.
     */
    let routes = role.routes;
    if (routes.includes("/departments")) {
      await page.goto(`${BASE}/departments`, { waitUntil: "networkidle" });
      const href = await page.$$eval("a[href^='/departments/']", (as) =>
        as.map((a) => a.getAttribute("href")).find(Boolean),
      );
      if (href) routes = [...routes, href];
    }

    await walk(page, role.name, routes);
    await context.close();
  }

  await browser.close();
  await writeFile(join(OUT, "report.txt"), report.join("\n"), "utf8");

  console.log(`\nscreenshots: ${OUT}`);
  if (failures.length) {
    console.error(`\n${failures.length} problem(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("\nall routes clean at every breakpoint");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
