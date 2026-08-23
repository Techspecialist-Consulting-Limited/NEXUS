/**
 * Drive the assistant end to end, without a microphone.
 *
 * The visual sweep can load the dashboard but can never ask it anything, so
 * the surface that matters most would go unchecked. A stubbed
 * SpeechRecognition emits exactly the events Chrome does; everything after
 * that is real — the fetch, the route, the fact pack, the provider.
 *
 * Usage: node scripts/smoke-assistant.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3611";
const OUT = ".smoke";
const PHRASE = "what is blocked between teams";

const STUB = `
  class FakeRecognition {
    constructor() { this.onresult = null; this.onerror = null; this.onend = null; }
    start() {
      setTimeout(() => this.onresult?.({
        resultIndex: 0,
        results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: ${JSON.stringify(PHRASE)} } } },
      }), 60);
    }
    stop() { setTimeout(() => this.onend?.(), 20); }
    abort() {}
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
  /*
   * Watch for any attempt to speak. There should never be one.
   *
   * Answers are written now — an executive scanning a dashboard does not want
   * to be talked at. This records a call rather than blocking it, so the sweep
   * can assert that nothing tried.
   *
   * Patch the METHOD, not the object: window.speechSynthesis is a read-only
   * accessor on Chromium, so assigning to it silently does nothing and the
   * assertion would test the harness rather than the page.
   */
  const synth = window.speechSynthesis;
  synth.speak = (u) => { window.__spoke = u.text; };
`;

let failures = 0;
const log = (ok, msg) => { if (!ok) failures++; console.log(`${ok ? "ok  " : "FAIL"}  ${msg}`); };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

for (const [label, width] of [["mobile", 390], ["desktop", 1440]]) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 900 : 1000 } });
  await context.addInitScript(STUB);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const options = await page.$$eval("select option", (n) => n.map((o) => ({ v: o.value, l: o.textContent ?? "" })));
  const exec = options.find((o) => /chairman/i.test(o.l));
  await page.request.post(`${BASE}/api/persona`, { data: { profileId: exec.v } });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });

  const mic = page.getByRole("button", { name: /tap to speak/i }).first();
  const has = await mic.waitFor({ state: "visible", timeout: 6000 }).then(() => true).catch(() => false);
  log(has, `${label}  the assistant offers a way to speak`);
  if (!has) { await context.close(); continue; }

  await mic.click();
  const heard = await page.getByText(PHRASE, { exact: false }).first()
    .waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
  log(heard, `${label}  shows what it is hearing, live`);
  await page.screenshot({ path: `${OUT}/assistant_${label}_listening.png`, fullPage: true });

  await page.getByRole("button", { name: /stop and ask/i }).first().click();

  const answered = await page.getByText(/^Answer$|Not in this week/i).first()
    .waitFor({ state: "visible", timeout: 25_000 }).then(() => true).catch(() => false);
  log(answered, `${label}  an answer comes back`);

  if (answered) {
    const spoke = await page.evaluate(() => window.__spoke ?? "");
    log(spoke.length === 0, `${label}  nothing is read aloud${spoke ? ` — spoke "${spoke.slice(0, 40)}"` : ""}`);

    /*
     * The answer scrolls inside its own box rather than stretching the page.
     * A long answer used to push everything below it down by several hundred
     * pixels and slide the controls off the bottom of a phone.
     */
    const box = await page.evaluate(() => {
      const el = document.querySelector('[role="region"][aria-label="Answer"]');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { h: Math.round(el.getBoundingClientRect().height), overflowY: cs.overflowY };
    });
    log(box !== null, `${label}  the answer has its own region`);
    if (box) {
      log(box.overflowY === "auto", `${label}  the answer scrolls rather than stretching`);
      log(box.h <= 280, `${label}  the answer is capped at ${box.h}px`);
    }

    const body = await page.locator("main").innerText();
    log(!/undefined|NaN|\[object/.test(body), `${label}  no broken values on screen`);
    log(/ask another/i.test(body), `${label}  offers to ask again`);
    await page.screenshot({ path: `${OUT}/assistant_${label}_answered.png`, fullPage: true });
  }

  /*
   * The typed way in, which is a different code path and was broken.
   *
   * The route required two words — a rule written for a mis-firing microphone
   * — so every one-word typed question came back 422 and the console rendered
   * it as "I could not answer that just now. Try again in a moment." Voice and
   * the suggestion chips both send full sentences, so nothing here noticed.
   *
   * TYPED is deliberately one word. That is how people type into a box.
   */
  const TYPED = "Blockers";
  const field = page.getByRole("textbox", { name: /ask the assistant/i }).first();
  const typable = await field.waitFor({ state: "visible", timeout: 6000 })
    .then(() => true).catch(() => false);
  log(typable, `${label}  a question can be typed`);

  if (typable) {
    await field.fill(TYPED);
    await field.press("Enter");

    const replied = await page.getByText(/^Answer$|Not in this week/i).first()
      .waitFor({ state: "visible", timeout: 25_000 }).then(() => true).catch(() => false);
    log(replied, `${label}  a one-word typed question is answered`);

    const after = await page.locator("main").innerText();
    log(
      !/could not answer|could not read that|nothing there to answer|could not reach/i.test(after),
      `${label}  no failure message after typing`,
    );
    await page.screenshot({ path: `${OUT}/assistant_${label}_typed.png`, fullPage: true });
  }

  log(errors.length === 0, `${label}  no client errors${errors.length ? ` — ${errors[0]}` : ""}`);
  await context.close();
}

await browser.close();
console.log(failures === 0 ? `\nthe assistant works end to end — screenshots in ${OUT}` : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
