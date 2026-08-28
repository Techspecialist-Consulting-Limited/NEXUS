import { chromium } from "playwright";

const VIEWPORTS = [
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1536x864", width: 1536, height: 864 },
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

  await page.goto(`${BASE}/commitments`, { waitUntil: "networkidle" });
  try {
    await page.getByText("Tasks", { exact: true }).first().waitFor({ timeout: 15000 });
  } catch {
    console.log(`\n=== ${vp.name} === !! Tasks heading not rendered; URL=${page.url()}`);
    await context.close();
    continue;
  }
  await page.waitForTimeout(800);

  const info = await page.evaluate(() => {
    const doc = document.documentElement;
    const r = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) };
    };
    return {
      winW: window.innerWidth,
      winH: window.innerHeight,
      docH: doc.scrollHeight,
      h1: document.querySelector("h1")?.textContent?.trim(),
      current: r('[aria-label="Current week"]'),
      attention: r('[aria-label="Needs attention"]'),
      previous: r('[aria-label="Previous weeks"]'),
      summary: r('[aria-label="Summary"]'),
    };
  });

  console.log(`\n=== ${vp.name} === h1="${info.h1}"`);
  console.log(`  win=${info.winW}x${info.winH}  docH=${info.docH}  ${info.docH <= info.winH ? "FITS ✅" : `OVERFLOW ${info.docH - info.winH}px ❌`}`);
  console.log(`  summary   ${JSON.stringify(info.summary)}`);
  console.log(`  current   ${JSON.stringify(info.current)}`);
  console.log(`  attention ${JSON.stringify(info.attention)}`);
  console.log(`  previous  ${JSON.stringify(info.previous)}`);

  await page.screenshot({ path: `C:/Users/Tofee/AppData/Local/Temp/opencode/tasks-${vp.name}.png` });
  await context.close();
}

await browser.close();
