/**
 * Add a sending domain to Resend and print the DNS records it needs.
 *
 * Usage:  node --env-file-if-exists=.env.local scripts/add-domain.ts <domain> [region]
 */
import { Resend } from "resend";

const [name, region = "eu-west-1"] = process.argv.slice(2);
if (!name) {
  console.error("usage: node scripts/add-domain.ts <domain> [region]");
  process.exit(1);
}

const resend = new Resend(process.env.RESEND_API_KEY);

const { data: existing } = await resend.domains.list();
const already = (existing as { data?: { id: string; name: string }[] })?.data?.find(
  (d) => d.name === name,
);

let id: string;
if (already) {
  console.log(`${name} is already on this account.\n`);
  id = already.id;
} else {
  const { data, error } = await resend.domains.create({
    name,
    region: region as "us-east-1" | "eu-west-1" | "sa-east-1" | "ap-northeast-1",
  });
  if (error) {
    console.error(`could not add ${name}: ${error.message}`);
    process.exit(1);
  }
  id = (data as { id: string }).id;
  console.log(`added ${name} (region ${region})\n`);
}

const { data: detail } = await resend.domains.get(id);
const records =
  (detail as { records?: { name: string; type: string; value: string; priority?: number }[] })
    ?.records ?? [];

const root = name.split(".").slice(-2).join(".");

console.log("Add these in GoDaddy — Domains -> DNS -> Manage Zones.");
console.log(`The Name column is relative to ${root}; paste it exactly as shown.`);
console.log(`You do NOT need to create the subdomain first — these records make it.\n`);

for (const r of records) {
  console.log(`  Type:     ${r.type}`);
  console.log(`  Name:     ${r.name}`);
  console.log(`  Value:    ${r.value}`);
  if (r.priority !== undefined) console.log(`  Priority: ${r.priority}`);
  console.log("");
}
