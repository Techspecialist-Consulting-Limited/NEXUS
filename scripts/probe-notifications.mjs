import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.setDefaultNavigationTimeout(90_000);

const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await p.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
const opts = await p.$$eval("select option", (n) => n.map((x) => ({ v: x.value, l: x.textContent ?? "" })));
const chidi = opts.find((o) => /chidi/i.test(o.l));
await p.request.post("http://localhost:3000/api/persona", { data: { profileId: chidi.v } });

const res = await p.goto("http://localhost:3000/notifications", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);

console.log("status:", res?.status());
console.log("errors:");
for (const e of [...new Set(errors)].slice(0, 6)) console.log("  " + e.split("\n")[0].slice(0, 220));
await b.close();
process.exit(0);
