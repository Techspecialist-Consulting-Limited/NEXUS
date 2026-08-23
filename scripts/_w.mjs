import { chromium } from "playwright";
const BASE = "http://localhost:3670";
const SPOKEN = "shipped the brand assets work and legal is still blocking the vendor contract next week I will start the payments spike";
const STUB = `
  class FakeRecognition {
    constructor() { this.onresult = null; this.onerror = null; this.onend = null; }
    start() { setTimeout(() => this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: ${JSON.stringify(SPOKEN)} } } } }), 60); }
    stop() { setTimeout(() => this.onend?.(), 20); }
    abort() {}
  }
  window.SpeechRecognition = FakeRecognition; window.webkitSpeechRecognition = FakeRecognition;
`;
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 390, height: 844 } });
await c.addInitScript(STUB);
const p = await c.newPage();
p.on("pageerror", e => console.log("PAGEERROR", e.message));
await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
const opts = await p.$$eval("select option", n => n.map(o => ({ v: o.value, l: (o.textContent ?? "").toLowerCase() })));
await p.request.post(`${BASE}/api/persona`, { data: { profileId: opts.find(o => o.l.includes("chidi")).v } });
await p.goto(`${BASE}/check-in`, { waitUntil: "networkidle" });
await p.waitForTimeout(400);
const shot = async (n) => {
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.screenshot({ path: `.smoke/wiz_${n}.png`, fullPage: true });
  console.log(`  ${n}: ${h}px`);
};
await shot("0_entry");
await p.getByRole("button", { name: /begin/i }).click();
await p.waitForTimeout(500);
await shot("1_target");
for (let i = 0; i < 8; i++) {
  const opt = p.getByRole("button", { name: /Done|Partly done|Still working/ }).first();
  if (await opt.count() === 0) break;
  await opt.click();
  await p.waitForTimeout(300);
  const next = p.getByRole("button", { name: /Next commitment|Continue|Next/i }).first();
  if (await next.count() === 0) break;
  await next.click();
  await p.waitForTimeout(500);
  const step = await p.locator("text=/\d\/5/").first().innerText().catch(() => "?");
  if (!step.startsWith("1")) break;
}
await shot("2_changed");
await b.close();
