/**
 * Prove the Supabase client is genuinely wired up, without creating anything.
 *
 * Submitting a deliberately wrong credential is enough: a correctly configured
 * client gets "Invalid login credentials" back FROM SUPABASE, while a
 * misconfigured one fails differently — a bad key gives an API-key error, a
 * bad URL gives a network error, and no provider at all would not render this
 * form in the first place. The distinction is the whole point, so the script
 * reports which of those actually happened.
 *
 * Usage:  node scripts/verify-auth.mjs <baseUrl>
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3300";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

const network = [];
page.on("response", async (res) => {
  const url = res.url();
  if (url.includes("/auth/v1/")) {
    network.push({ url: url.replace(/\?.*/, ""), status: res.status() });
  }
});

await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 90_000 });

const emailToggle = page.getByRole("button", { name: /email address/i });
if (await emailToggle.count()) await emailToggle.click();

await page.getByPlaceholder("you@company.com").fill("definitely-not-a-user@nexus.invalid");
await page.getByPlaceholder("Password").fill("wrong-password-on-purpose");
await page.getByRole("button", { name: /^sign in$/i }).click();

await page.waitForTimeout(3500);

const shown = await page
  .locator("p")
  .filter({ hasText: /invalid|credential|error|failed|key/i })
  .first()
  .textContent()
  .catch(() => null);

console.log("auth calls made:");
for (const n of network) console.log(`  ${n.status}  ${n.url}`);
console.log("\nmessage shown to the user:");
console.log(`  ${shown?.trim() ?? "(none)"}`);

const reachedSupabase = network.some((n) => n.url.includes("/auth/v1/token"));
const looksLikeBadKey = /api key|apikey|jwt|unauthorized/i.test(shown ?? "");

console.log("");
if (reachedSupabase && !looksLikeBadKey) {
  console.log("PASS — the form reached Supabase and got a real credential rejection.");
} else if (looksLikeBadKey) {
  console.log("FAIL — Supabase rejected the KEY, not the credential. Check the publishable/anon key.");
} else {
  console.log("FAIL — no call to /auth/v1/token. The client never reached Supabase.");
}

await browser.close();
process.exit(reachedSupabase && !looksLikeBadKey ? 0 : 1);
