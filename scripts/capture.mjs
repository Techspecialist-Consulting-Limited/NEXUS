/**
 * Screenshot one URL at every breakpoint.
 *
 * For looking at a single screen without running the whole smoke sweep.
 * Lives in scripts/ rather than a temp directory so `playwright` resolves from
 * the project's node_modules.
 *
 * Usage:  node scripts/capture.mjs <url> <name> [selectorToClickFirst]
 */
import { chromium } from "playwright";

const [url, name, clickFirst] = process.argv.slice(2);
if (!url || !name) {
  console.error("usage: node scripts/capture.mjs <url> <name> [selector]");
  process.exit(1);
}

const VIEWPORTS = [
  { label: "mobile", width: 360, height: 800 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "desktop", width: 1440, height: 900 },
];

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(800);

  if (clickFirst) {
    const target = page.locator(clickFirst).first();
    if (await target.count()) {
      await target.click();
      await page.waitForTimeout(400);
    }
  }

  const path = `.smoke/${name}.${vp.label}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(path);
  await page.close();
}
await browser.close();
process.exit(0);
