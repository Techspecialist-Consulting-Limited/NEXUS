/**
 * Sign in through the real UI and confirm the app renders that person's view.
 *
 * Verifying against GoTrue proves the credential works. It does not prove the
 * app then resolves a membership and renders the right product for that role,
 * which is the part that actually matters.
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3500";
const CASES = [
  { email: "exec@nexus.demo", expect: "/dashboard", heading: /command/i },
  { email: "hr@nexus.demo", expect: "/compliance", heading: /reporting/i },
  { email: "chidi@nexus.demo", expect: "/my-week", heading: /hello/i },
];

const browser = await chromium.launch();
let failed = 0;

for (const c of CASES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(90_000);

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const emailToggle = page.getByRole("button", { name: /use an email address/i });
  if (await emailToggle.count()) await emailToggle.click();

  await page.getByPlaceholder("you@company.com").fill(c.email);
  await page.getByPlaceholder("Password").fill("NexusDemo!2026");
  await page.getByRole("button", { name: /^sign in$/i }).click();

  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 })
    .catch(() => {});
  await page.waitForTimeout(1500);

  const path = new URL(page.url()).pathname;
  const h1 = (await page.locator("h1").first().textContent().catch(() => "")) ?? "";
  const ok = path === c.expect && c.heading.test(h1);
  console.log(`  ${ok ? "ok  " : "FAIL"} ${c.email.padEnd(20)} -> ${path.padEnd(14)} "${h1.trim()}"`);
  if (!ok) failed++;

  await page.screenshot({ path: `.smoke/live-${c.email.split("@")[0]}.png`, fullPage: true });
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall roles signed in and landed correctly");
process.exit(failed ? 1 : 0);
