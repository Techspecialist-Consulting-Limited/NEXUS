import { chromium } from "playwright";

const VIEWPORTS = [
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
];

const BASE = process.env.BASE ?? "http://localhost:3100";
const PERSONA = "chidi@nexus.demo";

const browser = await chromium.launch();
const probe = await browser.newContext();
const p1 = await probe.newPage();
await p1.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
const options = await p1.$$eval("select option", (nodes) =>
  nodes.map((o) => ({ value: o.value, label: o.textContent ?? "" })),
);
const wanted = PERSONA.split("@")[0].toLowerCase();
const persona = options.find((o) => o.label.toLowerCase().includes(wanted)) ?? options[0];
await probe.close();

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  if (persona) await page.request.post(`${BASE}/api/persona`, { data: { profileId: persona.value } });

  await page.goto(`${BASE}/my-week`, { waitUntil: "networkidle" });
  // Wait deterministically for the check-in card heading.
  try {
    await page.getByText("How would you like to check-in?", { exact: true }).first().waitFor({ timeout: 15000 });
  } catch {
    console.log(`\n=== ${vp.name} === !! never found check-in heading; URL=${page.url()}`);
    await context.close();
    continue;
  }
  await page.waitForTimeout(800);

  // Find the outer grid (two-row grid) by its distinctive template rows.
  const info = await page.evaluate(() => {
    const doc = document.documentElement;
    const allDivs = [...document.querySelectorAll("div")];
    const outer = allDivs.find((d) => {
      const cs = getComputedStyle(d);
      return cs.display === "grid" && cs.gridTemplateColumns.includes("1.6fr");
    }) ?? null;
    const cs = outer ? getComputedStyle(outer) : null;
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
    };
    const card = (aria) =>
      [...document.querySelectorAll("section,[aria-label]")].find(
        (s) => s.getAttribute("aria-label") === aria,
      );
    return {
      winW: window.innerWidth,
      winH: window.innerHeight,
      docH: doc.scrollHeight,
      outerDisplay: cs ? cs.display : "-",
      outerCols: cs ? cs.gridTemplateColumns : "-",
      checkin: rect(document.querySelector("h2")?.closest("section")),
      noticed: rect(card("NEXUS noticed")),
      working: rect(card("What you're working on")),
      coaching: rect(card("Coaching highlight")),
    };
  });

  console.log(`\n=== ${vp.name} ===`);
  console.log(`  win=${info.winW}x${info.winH}  docH=${info.docH}  ${info.docH <= info.winH ? "FITS ✅" : `OVERFLOW ${info.docH - info.winH}px ❌`}`);
  console.log(`  outer: display=${info.outerDisplay} cols=${info.outerCols}`);
  console.log(`  checkin  ${JSON.stringify(info.checkin)}`);
  console.log(`  noticed  ${JSON.stringify(info.noticed)}`);
  console.log(`  working  ${JSON.stringify(info.working)}`);
  console.log(`  coaching ${JSON.stringify(info.coaching)}`);

  await page.screenshot({ path: `C:/Users/Tofee/AppData/Local/Temp/opencode/myweek-${vp.name}.png`, fullPage: false });
  await context.close();
}

await browser.close();
