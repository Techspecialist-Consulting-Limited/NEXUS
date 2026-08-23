/**
 * File a check-in without ever leaving the page.
 *
 * The flow this walks is the product's core loop for an employee: speak,
 * NEXUS sorts it, confirm, file — and the page updates in place. Nothing here
 * is stubbed except the microphone, because a headless browser has none.
 *
 * Usage: node scripts/smoke-checkin.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3670";
const SPOKEN =
  "finished the design token documentation and legal is still blocking the vendor contract next week I will start the payments spike";

const STUB = `
  class FakeRecognition {
    constructor() { this.onresult = null; this.onerror = null; this.onend = null; }
    start() {
      setTimeout(() => this.onresult?.({
        resultIndex: 0,
        results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: ${JSON.stringify(SPOKEN)} } } },
      }), 60);
    }
    stop() { setTimeout(() => this.onend?.(), 20); }
    abort() {}
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
`;

let failures = 0;
const log = (ok, msg) => { if (!ok) failures++; console.log(`${ok ? "ok  " : "FAIL"}  ${msg}`); };

const browser = await chromium.launch();

for (const [label, width] of [["mobile", 390], ["desktop", 1440]]) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 900 : 1000 } });
  await context.addInitScript(STUB);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const opts = await page.$$eval("select option", (n) => n.map((o) => ({ v: o.value, l: o.textContent ?? "" })));
  await page.request.post(`${BASE}/api/persona`, { data: { profileId: opts.find((o) => /kelechi/i.test(o.l)).v } });
  await page.goto(`${BASE}/my-week`, { waitUntil: "networkidle" });

  const urlBefore = page.url();

  const mic = page.getByRole("button", { name: /voice check-in/i }).first();
  const hasMic = await mic.waitFor({ state: "visible", timeout: 6000 }).then(() => true).catch(() => false);
  log(hasMic, `${label}  the card offers a voice check-in`);
  if (!hasMic) { await context.close(); continue; }

  await mic.click();
  const heard = await page.getByText(SPOKEN.slice(0, 30), { exact: false }).first()
    .waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
  log(heard, `${label}  shows what it is hearing`);

  await page.getByRole("button", { name: /stop and sort/i }).first().click();

  const review = page.getByText(/check this over/i).first();
  const sorted = await review.waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false);
  log(sorted, `${label}  sorts it into a draft to confirm`);
  if (!sorted) { await context.close(); continue; }

  log(page.url() === urlBefore, `${label}  never navigated away from the page`);

  const boxes = page.locator("textarea");
  const thisWeek = await boxes.first().inputValue();
  log(/design token|vendor/i.test(thisWeek), `${label}  this week carries what was said`);

  const nextWeek = await boxes.nth(1).inputValue();
  log(/payments/i.test(nextWeek), `${label}  next week is separated out`);

  await page.getByRole("button", { name: /file my week/i }).first().click();

  const filed = await page.getByText(/^Filed$/).first()
    .waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false);
  log(filed, `${label}  filing confirms in place`);
  log(page.url() === urlBefore, `${label}  still on the same page after filing`);

  log(errors.length === 0, `${label}  no client errors${errors.length ? ` — ${errors[0]}` : ""}`);
  await context.close();
}

await browser.close();
console.log(failures === 0 ? "\ncheck-in works without leaving the page" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
