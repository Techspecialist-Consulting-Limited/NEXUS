/**
 * Check the Resend configuration using the same SDK the app uses.
 *
 * A raw curl gets blocked by Cloudflare (403, code 1010) because of its
 * user-agent, which looks exactly like an invalid key and is not. Going
 * through the SDK removes that ambiguity.
 *
 * Usage:  node --env-file-if-exists=.env.local scripts/check-resend.ts [to]
 */
import { Resend } from "resend";

const key = process.env.RESEND_API_KEY;
if (!key) {
  console.error("RESEND_API_KEY is not set.");
  process.exit(1);
}

const resend = new Resend(key);

const { data, error } = await resend.domains.list();
if (error) {
  console.error(`domains.list failed: ${error.message}`);
  process.exit(1);
}

const rows = (data as { data?: { name: string; status: string }[] })?.data ?? [];
console.log("key accepted by Resend.\n");
console.log("domains on this account:");
if (rows.length === 0) {
  console.log("  none verified — you can only send from onboarding@resend.dev,");
  console.log("  and only to the address that owns this Resend account.");
}
for (const d of rows) {
  console.log(`  ${d.name.padEnd(38)} ${d.status}`);
}

console.log(`\nEMAIL_FROM is currently: ${process.env.EMAIL_FROM ?? "(unset)"}`);
