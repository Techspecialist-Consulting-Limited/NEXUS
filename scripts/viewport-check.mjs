/**
 * Confirms the floating nav really is pinned to the viewport.
 *
 * The full-page screenshots in smoke.mjs paint `position: fixed` elements once,
 * at their scroll-zero position, so the nav appears stranded in the middle of a
 * tall page. That is a capture artifact, but it looks identical to a genuine
 * layout bug — so this measures the nav against the viewport instead of
 * trusting the picture.
 */

import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
const page = await context.newPage();

await page.goto(`${BASE}/my-week`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await page.screenshot({ path: ".smoke/viewport-top.png" });

const atTop = await page.evaluate(() => {
  const nav = document.querySelector("nav");
  const r = nav.getBoundingClientRect();
  return {
    bottomGap: Math.round(window.innerHeight - r.bottom),
    position: getComputedStyle(nav).position,
  };
});

await page.evaluate(() => window.scrollTo(0, 1200));
await page.waitForTimeout(600);
await page.screenshot({ path: ".smoke/viewport-scrolled.png" });

const afterScroll = await page.evaluate(() => {
  const nav = document.querySelector("nav");
  const r = nav.getBoundingClientRect();
  return { bottomGap: Math.round(window.innerHeight - r.bottom) };
});

console.log("nav position:      ", atTop.position);
console.log("gap below nav, top:", atTop.bottomGap, "px");
console.log("gap after scroll:  ", afterScroll.bottomGap, "px");

const pinned =
  atTop.position === "fixed" &&
  Math.abs(atTop.bottomGap - afterScroll.bottomGap) <= 1 &&
  atTop.bottomGap >= 0 &&
  atTop.bottomGap < 40;

console.log(pinned ? "\nPASS — nav stays pinned to the bottom" : "\nFAIL — nav is not pinned");

await browser.close();
process.exit(pinned ? 0 : 1);
