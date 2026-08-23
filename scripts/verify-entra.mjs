/**
 * Verify the Microsoft Entra ID handoff, as far as it can go without a password.
 *
 * Clicking the button should leave the app entirely and land on Microsoft's
 * sign-in page, carrying a client_id that matches the Azure app registration
 * and a redirect_uri pointing back at Supabase. Those three things are what
 * every misconfiguration gets wrong, and each fails with a different Microsoft
 * error code — so checking them here is cheaper than reading AADSTS numbers.
 *
 * Usage:  node scripts/verify-entra.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 90_000 });

const button = page.getByRole("button", { name: /continue with microsoft/i });
const present = (await button.count()) > 0;
console.log(`  Microsoft button rendered: ${present ? "yes" : "NO"}`);
if (!present) {
  console.error("\nFAIL — the provider is enabled in Supabase but the button is absent.");
  console.error("The provider lookup caches for a minute; restart the dev server.");
  await browser.close();
  process.exit(1);
}

await page.screenshot({ path: ".smoke/entra-login.png", fullPage: true });

await button.click();
await page.waitForURL(/login\.microsoftonline\.com|login\.live\.com/, { timeout: 45_000 })
  .catch(() => {});

const url = new URL(page.url());
console.log(`  landed on: ${url.host}${url.pathname}`);

const reachedMicrosoft = /microsoftonline\.com|login\.live\.com/.test(url.host);
const clientId = url.searchParams.get("client_id");
const redirectUri = url.searchParams.get("redirect_uri");

console.log(`  client_id:    ${clientId ?? "(absent)"}`);
console.log(`  redirect_uri: ${redirectUri ?? "(absent)"}`);

const EXPECTED_CLIENT = "5d4307fb-e2eb-4dc8-b588-30ca0632d80a";
const EXPECTED_REDIRECT = "https://nxzgkbxfcyikrwasxoib.supabase.co/auth/v1/callback";

await page.screenshot({ path: ".smoke/entra-microsoft.png", fullPage: true });

const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 400);
const aadError = bodyText.match(/AADSTS\d+[^\n]*/)?.[0];

console.log("");
if (aadError) {
  console.error(`FAIL — Microsoft rejected the request:\n  ${aadError}`);
} else if (!reachedMicrosoft) {
  console.error(`FAIL — never reached Microsoft. Still on ${url.host}.`);
} else if (clientId !== EXPECTED_CLIENT) {
  console.error(`FAIL — client_id is ${clientId}, expected ${EXPECTED_CLIENT}.`);
} else if (redirectUri !== EXPECTED_REDIRECT) {
  console.error(`FAIL — redirect_uri is ${redirectUri}, expected the Supabase callback.`);
} else {
  console.log("PASS — Microsoft is showing its sign-in page for the right app.");
  console.log("Only a real credential can go further; the configuration is correct.");
}

await browser.close();
process.exit(aadError || !reachedMicrosoft || clientId !== EXPECTED_CLIENT ? 1 : 0);
