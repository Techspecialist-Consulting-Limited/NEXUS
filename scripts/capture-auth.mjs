/**
 * Capture the sign-in panel as it looks with a provider configured.
 *
 * The dev fallback hides the Microsoft/Google/email branch entirely, so its
 * layout would otherwise never be seen until the day Entra is wired up — which
 * is the worst possible moment to discover a broken button row.
 *
 * The credentials are placeholders: enough for authMode() to report
 * "supabase" and render the real panel. Nothing here can sign anybody in.
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = "3200";
const BASE = `http://localhost:${PORT}`;

const server = spawn("npx", ["next", "start", "--port", PORT], {
  shell: process.platform === "win32",
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key",
  },
});
process.on("exit", () => server.kill());

for (let i = 0; i < 200; i++) {
  try {
    const r = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(5000) });
    if (r.status < 500) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch();
for (const vp of [
  { label: "mobile", width: 360, height: 800 },
  { label: "desktop", width: 1440, height: 900 },
]) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `.smoke/provider-login.${vp.label}.png`, fullPage: true });

  // Reveal the email branch too — it is hidden behind a disclosure.
  const emailButton = page.getByRole("button", { name: /email address/i });
  if (await emailButton.count()) {
    await emailButton.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `.smoke/provider-login-email.${vp.label}.png`, fullPage: true });
  }
  await page.close();
}
await browser.close();
server.kill();
console.log("captured provider sign-in panel");

/*
 * Force the exit. `next start` leaves a detached child that keeps the event
 * loop alive on Windows, so killing the parent is not enough and the script
 * otherwise hangs until whatever is running it gives up.
 */
process.exit(0);
