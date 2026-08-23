/**
 * Ask Resend to re-check a domain's DNS, then poll until it settles.
 *
 * Verification is not instant: Resend queries the records itself, and a
 * just-published record can take a few minutes to be visible from their
 * resolvers even when it already resolves locally.
 *
 * Usage:  node --env-file-if-exists=.env.local scripts/verify-domain.ts <domain>
 */
import { Resend } from "resend";

const name = process.argv[2];
if (!name) {
  console.error("usage: node scripts/verify-domain.ts <domain>");
  process.exit(1);
}

const resend = new Resend(process.env.RESEND_API_KEY);

const { data: list } = await resend.domains.list();
const domain = (list as { data?: { id: string; name: string }[] })?.data?.find(
  (d) => d.name === name,
);
if (!domain) {
  console.error(`${name} is not on this Resend account.`);
  process.exit(1);
}

await resend.domains.verify(domain.id);
console.log(`asked Resend to verify ${name}\n`);

for (let attempt = 1; attempt <= 10; attempt++) {
  const { data } = await resend.domains.get(domain.id);
  const d = data as {
    status: string;
    records?: { type: string; name: string; status: string }[];
  };

  console.log(`  attempt ${attempt}: ${d.status}`);
  for (const r of d.records ?? []) {
    console.log(`      ${r.type.padEnd(4)} ${r.name.padEnd(28)} ${r.status}`);
  }

  if (d.status === "verified") {
    console.log(`\nVERIFIED — you can now send from any address at ${name}.`);
    process.exit(0);
  }
  if (d.status === "failure") {
    console.error("\nFAILED — Resend could not confirm the records.");
    process.exit(1);
  }

  if (attempt < 10) await new Promise((r) => setTimeout(r, 12_000));
}

console.log("\nStill pending. DNS can take a while to reach Resend's resolvers;");
console.log("run this again in a few minutes.");
