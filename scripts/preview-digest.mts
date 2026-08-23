/**
 * Generate the executive briefing and show it.
 *
 * Writes the HTML to .smoke/digest.html so the email can be opened in a
 * browser, and prints the plain-text form — which is what actually gets read
 * on a phone.
 *
 * Usage:
 *   node --env-file-if-exists=.env.local --import tsx scripts/preview-digest.mts [--send you@example.com]
 */
import { writeFile, mkdir } from "node:fs/promises";
import { asService } from "../lib/db";
import { generateDigest, renderDigestEmail } from "../lib/ai/executive-digest";
import { providerLabel } from "../lib/ai/provider";

const sendFlag = process.argv.indexOf("--send");
const sendTo = sendFlag >= 0 ? process.argv[sendFlag + 1] : null;

const [cycle] = await asService(
  (sql) => sql<{ id: string; label: string }>`
    select cy.id, cy.label
    from cycles cy
    where cy.kind = 'week'
      and exists (select 1 from reconciliations r
                   where r.cycle_id = cy.id
                     and r.status in ('confirmed', 'auto_confirmed'))
    order by cy.starts_on desc
    limit 1
  `,
);

if (!cycle) {
  console.error("No settled week to brief on.");
  process.exit(1);
}

console.log(`model:  ${providerLabel()}`);
console.log(`cycle:  ${cycle.label}\n`);

const digest = await generateDigest(cycle.id, "weekly");
if (!digest) {
  console.error("That organisation has no Chairman, so there is nobody to brief.");
  process.exit(1);
}

const rendered = renderDigestEmail(digest, "http://localhost:3000");

console.log("subject: " + rendered.subject);
console.log("─".repeat(64));
console.log(rendered.text);
console.log("─".repeat(64));

await mkdir(".smoke", { recursive: true });
await writeFile(".smoke/digest.html", rendered.html, "utf8");
console.log("\nHTML written to .smoke/digest.html");

if (sendTo) {
  const { send } = await import("../lib/email");
  const result = await send({ to: sendTo, ...rendered });
  console.log(
    result.delivered
      ? `sent to ${sendTo} (id ${result.id})`
      : `not sent — ${result.reason}`,
  );
}

process.exit(0);
