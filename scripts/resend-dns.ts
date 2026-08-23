/**
 * Print the DNS records that verify a Resend sending domain.
 *
 * Usage:  node --env-file-if-exists=.env.local scripts/resend-dns.ts
 */
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const { data: list } = await resend.domains.list();
const domains = (list as { data?: { id: string; name: string; status: string }[] })?.data ?? [];

if (domains.length === 0) {
  console.log("No domains on this account. Add one at resend.com/domains.");
  process.exit(0);
}

for (const d of domains) {
  console.log(`\n${d.name}  —  ${d.status}\n`);
  const { data } = await resend.domains.get(d.id);
  const records =
    (data as { records?: { record: string; name: string; type: string; value: string; ttl?: string; priority?: number }[] })
      ?.records ?? [];

  for (const r of records) {
    console.log(`  ${r.type.padEnd(5)} ${r.name}`);
    console.log(`        value: ${r.value}`);
    if (r.priority !== undefined) console.log(`        priority: ${r.priority}`);
    console.log("");
  }
}
